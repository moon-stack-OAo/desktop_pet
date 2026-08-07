/**
 * 系统托盘与统一应用菜单
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app, Menu, Tray, nativeImage } = require('electron');
const log = require('./logger');
const { IPC } = require('../shared/ipc-channels');
const { BEHAVIOR_MENU_ITEMS } = require('../shared/menu-model');

/**
 * @param {unknown} err
 * @returns {string}
 */
function formatErr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * @typedef {object} TrayHost
 * @property {() => import('electron').BrowserWindow | null} getMainWindow
 * @property {() => import('electron').Tray | null} getTray
 * @property {(t: import('electron').Tray | null) => void} setTray
 * @property {() => import('../shared/pet-payload').PetCatalogItem[]} getCatalog
 * @property {() => string} getCurrentPetId
 * @property {() => { displayName?: string; id?: string } | null} getCurrentPayload
 * @property {() => boolean} getIgnoreMouse
 * @property {(petId: string) => void | Promise<unknown>} switchPet
 * @property {(ignore: boolean) => void} applyIgnoreMouse
 */

/**
 * 显示主窗并关闭点击穿透，保证后续 UI 可点
 * @param {TrayHost} host
 */
function showWindowInteractive(host) {
  if (host.getIgnoreMouse()) {
    host.applyIgnoreMouse(false);
  }
  const mainWindow = host.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

/**
 * 托盘：打开 AI 对话（放大窗口 + 通知渲染层）
 * @param {TrayHost} host
 */
function openChatFromTray(host) {
  const mainWindow = showWindowInteractive(host);
  if (!mainWindow) {
    log.warn('[tray] 打开对话失败：无主窗口');
    return;
  }
  try {
    const { expandWindowForUi } = require('./window');
    expandWindowForUi(host);
  } catch (err) {
    log.warn('[tray] expandWindow 失败:', formatErr(err));
  }
  mainWindow.webContents.send(IPC.UI_OPEN_CHAT);
}

/**
 * 托盘：打开 AI 设置
 * @param {TrayHost} host
 */
function openAiSettingsFromTray(host) {
  const mainWindow = showWindowInteractive(host);
  if (!mainWindow) {
    log.warn('[tray] 打开 AI 设置失败：无主窗口');
    return;
  }
  try {
    const { expandWindowForUi } = require('./window');
    expandWindowForUi(host);
  } catch (err) {
    log.warn('[tray] expandWindow 失败:', formatErr(err));
  }
  mainWindow.webContents.send(IPC.UI_OPEN_AI_SETTINGS);
}

/**
 * 向渲染进程请求触发逻辑行为
 * @param {string} behavior
 * @param {TrayHost} host
 */
function sendBehaviorRequest(behavior, host) {
  const mainWindow = host.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC.PET_REQUEST_BEHAVIOR, behavior);
}

/**
 * 应用统一原生菜单模板（托盘 + 宠物右键共用）
 * @param {TrayHost} host
 * @returns {import('electron').MenuItemConstructorOptions[]}
 */
function buildAppMenuTemplate(host) {
  const catalogCache = host.getCatalog();
  const currentPetId = host.getCurrentPetId();
  const ignoreMouseEvents = host.getIgnoreMouse();

  // 不用 radio：Windows 上已勾选项再次点击常不触发 click，且异步 rebuild 易丢事件
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const switchSub =
    catalogCache.length > 0
      ? catalogCache.map((p) => {
          const isCurrent = p.id === currentPetId;
          const name = p.displayName || p.id;
          return {
            label: isCurrent ? `✓ ${name}` : name,
            id: `switch-pet-${p.id}`,
            click: () => {
              void host.switchPet(p.id);
            },
          };
        })
      : [{ label: '（无可用宠物）', enabled: false }];

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const behaviorItems = BEHAVIOR_MENU_ITEMS.map((item) => ({
    label: item.label,
    click: () => sendBehaviorRequest(item.behaviorId, host),
  }));

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  return [
    ...behaviorItems,
    { type: 'separator' },
    {
      label: 'AI 对话',
      click: () => openChatFromTray(host),
    },
    {
      label: 'AI 设置…',
      click: () => openAiSettingsFromTray(host),
    },
    { type: 'separator' },
    {
      label: '静音切换',
      click: () => {
        const mainWindow = host.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(IPC.PET_TOGGLE_MUTE);
      },
    },
    {
      label: '点击穿透',
      type: /** @type {const} */ ('checkbox'),
      checked: ignoreMouseEvents,
      click: (item) => {
        host.applyIgnoreMouse(!!item.checked);
      },
    },
    {
      label: '切换宠物',
      submenu: switchSub,
    },
    { type: 'separator' },
    {
      label: '检查更新',
      click: () => {
        try {
          const { requestManualCheck } = require('./updater');
          requestManualCheck();
        } catch (err) {
          log.warn('[updater] 手动检查失败:', formatErr(err));
        }
      },
    },
    {
      label: '显示/隐藏',
      click: () => {
        const mainWindow = host.getMainWindow();
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else {
          showWindowInteractive(host);
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ];
}

/**
 * 宠物小窗右键：原生 Menu.popup（可画出窗 bounds，与托盘同源模板）
 * @param {TrayHost} host
 * @param {{ x?: number; y?: number; vitalsLabel?: string; muted?: boolean }} [opts]
 */
function popupPetContextMenu(host, opts = {}) {
  const mainWindow = host.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // 穿透时先关，否则点不到菜单后续交互
  if (host.getIgnoreMouse && host.getIgnoreMouse()) {
    host.applyIgnoreMouse(false);
  }

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = buildAppMenuTemplate(host);

  // 可选：顶部状态行（饱食/心情）
  const vitalsLabel =
    opts && typeof opts.vitalsLabel === 'string' ? opts.vitalsLabel.trim() : '';
  if (vitalsLabel) {
    template.unshift(
      { label: vitalsLabel, enabled: false },
      { type: 'separator' },
    );
  }

  // 可选：按渲染层 muted 改静音文案
  if (opts && typeof opts.muted === 'boolean') {
    const muteItem = template.find(
      (item) => item && item.label === '静音切换',
    );
    if (muteItem) {
      muteItem.label = opts.muted ? '取消静音' : '静音';
    }
  }

  try {
    const menu = Menu.buildFromTemplate(template);
    const x = Math.round(Number(opts.x) || 0);
    const y = Math.round(Number(opts.y) || 0);
    menu.popup({ window: mainWindow, x, y });
  } catch (err) {
    log.warn('[pet] 弹出右键菜单失败:', formatErr(err));
  }
}

/**
 * @param {TrayHost} host
 */
function rebuildTrayMenu(host) {
  const tray = host.getTray();
  if (!tray || tray.isDestroyed()) return;
  try {
    tray.setContextMenu(Menu.buildFromTemplate(buildAppMenuTemplate(host)));
    const payload = host.getCurrentPayload();
    const name =
      payload?.displayName || host.getCurrentPetId() || 'desktop_pet';
    tray.setToolTip(`desktop_pet · ${name}`);
  } catch (err) {
    log.warn('[pet] 更新托盘菜单失败:', formatErr(err));
  }
}

/**
 * 解析应用图标路径（开发 / 打包）
 * @param {string} fileName
 */
function resolveAppIconPath(fileName) {
  const candidates = [
    path.join(__dirname, '../build', fileName),
    path.join(process.resourcesPath || '', fileName),
    path.join(process.resourcesPath || '', 'build', fileName),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 创建托盘图标 nativeImage
 */
function createTrayImage() {
  const trayPng = resolveAppIconPath('tray.png');
  if (trayPng) {
    let img = nativeImage.createFromPath(trayPng);
    if (!img.isEmpty()) {
      if (img.getSize().width > 32) {
        img = img.resize({ width: 32, height: 32 });
      }
      return img;
    }
  }
  const ico = resolveAppIconPath('icon.ico');
  if (ico) {
    const img = nativeImage.createFromPath(ico);
    if (!img.isEmpty()) return img.resize({ width: 32, height: 32 });
  }
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVQ4T2NkYGD4z0ABYBw1gGE0DAB9iAABhnTvWgAAAABJRU5ErkJggg==',
  );
}

/**
 * 启动时提示点击穿透已开（打包后无任务栏图标，易误以为无响应）
 * @param {import('electron').Tray} tray
 * @param {boolean} ignoreMouse
 */
function notifyIgnoreMouseIfNeeded(tray, ignoreMouse) {
  if (!ignoreMouse || !tray || tray.isDestroyed()) return;
  try {
    // Windows：气泡；其他平台仅 tooltip 已够
    if (process.platform === 'win32' && typeof tray.displayBalloon === 'function') {
      tray.displayBalloon({
        title: 'desktop_pet',
        content:
          '点击穿透已开启，窗口点不到。请右键本托盘图标，取消「点击穿透」。',
        iconType: 'info',
      });
    }
  } catch (err) {
    log.warn('[pet] 托盘气泡失败:', formatErr(err));
  }
  log.warn(
    '[window] 已恢复点击穿透：窗口不可点；请托盘取消「点击穿透」',
  );
}

/**
 * @param {TrayHost} host
 */
function createTray(host) {
  try {
    const icon = createTrayImage();
    const tray = new Tray(icon);
    host.setTray(tray);
    const payload = host.getCurrentPayload();
    tray.setToolTip(
      `desktop_pet · ${payload?.displayName || host.getCurrentPetId()}`,
    );
    tray.setContextMenu(Menu.buildFromTemplate(buildAppMenuTemplate(host)));
    tray.on('double-click', () => {
      const win = host.getMainWindow();
      if (!win || win.isDestroyed()) return;
      if (win.isVisible()) win.focus();
      else win.show();
    });
    tray.on('click', () => {
      // 单击也尝试显示/聚焦，避免「只有穿透时完全摸不到」
      const win = host.getMainWindow();
      if (!win || win.isDestroyed()) return;
      if (host.getIgnoreMouse()) {
        host.applyIgnoreMouse(false);
      }
      if (win.isMinimized()) win.restore();
      win.show();
      win.moveTop();
      win.focus();
    });
    notifyIgnoreMouseIfNeeded(tray, host.getIgnoreMouse());
    // 每次启动提示：透明窗 + 无任务栏时用户常以为没启动
    try {
      if (
        process.platform === 'win32' &&
        typeof tray.displayBalloon === 'function'
      ) {
        const name =
          payload?.displayName || host.getCurrentPetId() || 'desktop_pet';
        tray.displayBalloon({
          title: 'desktop_pet 已启动',
          content: `当前：${name}。应在主屏右下角；看不到请点本图标，或右键「显示/隐藏」。`,
          iconType: 'info',
        });
      }
    } catch {
      /* ignore */
    }
  } catch (err) {
    log.warn('[pet] 托盘创建失败:', formatErr(err));
    host.setTray(null);
    // 无托盘时强制关闭穿透，否则用户无法操作
    if (host.getIgnoreMouse()) {
      log.warn('[pet] 托盘不可用，已关闭点击穿透以免无法操作');
      host.applyIgnoreMouse(false);
    }
  }
}

module.exports = {
  sendBehaviorRequest,
  buildAppMenuTemplate,
  popupPetContextMenu,
  rebuildTrayMenu,
  resolveAppIconPath,
  createTrayImage,
  createTray,
  notifyIgnoreMouseIfNeeded,
  openChatFromTray,
  openAiSettingsFromTray,
  showWindowInteractive,
};
