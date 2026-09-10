// ===== Windows 95 Desktop Behavior =====

document.addEventListener('DOMContentLoaded', () => {
  const desktop = document.getElementById('desktop');
  const taskbarItems = document.getElementById('taskbar-items');
  const startButton = document.getElementById('start-button');
  const startMenu = document.getElementById('start-menu');
  const clockEl = document.getElementById('clock');

  const windows = Array.from(document.querySelectorAll('.window'));
  let zCounter = 10;
  const taskbarButtons = {};

  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    clockEl.textContent = `${hours}:${minutes} ${ampm}`;
  }
  updateClock();
  setInterval(updateClock, 1000 * 15);

  function getTitle(win) {
    return win.querySelector('.title-bar-text').textContent.trim();
  }

  function bringToFront(win) {
    windows.forEach(w => w.classList.remove('active'));
    win.classList.add('active');
    zCounter += 1;
    win.style.zIndex = zCounter;
    Object.values(taskbarButtons).forEach(btn => btn.classList.remove('active'));
    if (taskbarButtons[win.id]) taskbarButtons[win.id].classList.add('active');
  }

  function createTaskbarButton(win) {
    const btn = document.createElement('div');
    btn.className = 'taskbar-item';
    btn.textContent = getTitle(win);
    btn.addEventListener('click', () => {
      if (win.style.display === 'none' || !win.classList.contains('open')) {
        openWindow(win.id);
      } else if (win.classList.contains('active')) {
        minimizeWindow(win);
      } else {
        bringToFront(win);
      }
    });
    taskbarItems.appendChild(btn);
    taskbarButtons[win.id] = btn;
  }

  function openWindow(id) {
    const win = document.getElementById(id);
    if (!win) return;
    win.classList.add('open');
    win.style.display = 'flex';
    if (!taskbarButtons[id]) createTaskbarButton(win);
    bringToFront(win);
  }

  function closeWindow(win) {
    win.classList.remove('open', 'active');
    win.style.display = 'none';
    if (taskbarButtons[win.id]) {
      taskbarButtons[win.id].remove();
      delete taskbarButtons[win.id];
    }
  }

  function minimizeWindow(win) {
    win.style.display = 'none';
    win.classList.remove('active');
    if (taskbarButtons[win.id]) taskbarButtons[win.id].classList.remove('active');
  }

  function toggleMaximize(win) {
    if (win.dataset.maximized === 'true') {
      win.style.top = win.dataset.prevTop;
      win.style.left = win.dataset.prevLeft;
      win.style.width = win.dataset.prevWidth;
      win.style.height = win.dataset.prevHeight;
      win.dataset.maximized = 'false';
    } else {
      win.dataset.prevTop = win.style.top;
      win.dataset.prevLeft = win.style.left;
      win.dataset.prevWidth = win.style.width;
      win.dataset.prevHeight = win.style.height;
      win.style.top = '0px';
      win.style.left = '0px';
      win.style.width = '100%';
      win.style.height = '100%';
      win.dataset.maximized = 'true';
    }
  }

  // Wire up desktop icons (single tap opens on touch devices, double click opens on desktop)
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  document.querySelectorAll('.icon').forEach(icon => {
    let clickTimer = null;
    icon.addEventListener('click', () => {
      document.querySelectorAll('.icon').forEach(i => i.classList.remove('selected'));
      icon.classList.add('selected');
      if (isTouchDevice) {
        openWindow(icon.dataset.window);
        return;
      }
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        openWindow(icon.dataset.window);
      } else {
        clickTimer = setTimeout(() => { clickTimer = null; }, 350);
      }
    });
    icon.addEventListener('keydown', e => {
      if (e.key === 'Enter') openWindow(icon.dataset.window);
    });
  });

  // Wire up window controls + dragging
  windows.forEach(win => {
    const titleBar = win.querySelector('.title-bar');
    win.querySelector('.close-btn').addEventListener('click', () => closeWindow(win));
    win.querySelector('.minimize-btn').addEventListener('click', () => minimizeWindow(win));
    win.querySelector('.maximize-btn').addEventListener('click', () => toggleMaximize(win));
    win.addEventListener('pointerdown', () => bringToFront(win));

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    titleBar.addEventListener('pointerdown', e => {
      if (e.target.closest('.title-btn')) return;
      if (win.dataset.maximized === 'true') return;
      dragging = true;
      const rect = win.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      bringToFront(win);
      e.preventDefault();
    });

    document.addEventListener('pointermove', e => {
      if (!dragging) return;
      const desktopRect = desktop.getBoundingClientRect();
      let newLeft = e.clientX - offsetX;
      let newTop = e.clientY - offsetY;
      newLeft = Math.max(0, Math.min(newLeft, desktopRect.width - 60));
      newTop = Math.max(0, Math.min(newTop, desktopRect.height - 30));
      win.style.left = `${newLeft}px`;
      win.style.top = `${newTop}px`;
    });

    document.addEventListener('pointerup', () => { dragging = false; });
  });

  // Start menu
  startButton.addEventListener('click', () => {
    startMenu.classList.toggle('open');
    startButton.classList.toggle('pressed');
  });

  document.querySelectorAll('.start-menu-item[data-window]').forEach(item => {
    item.addEventListener('click', () => {
      openWindow(item.dataset.window);
      startMenu.classList.remove('open');
      startButton.classList.remove('pressed');
    });
  });

  document.addEventListener('click', e => {
    if (!startMenu.contains(e.target) && !startButton.contains(e.target)) {
      startMenu.classList.remove('open');
      startButton.classList.remove('pressed');
    }
  });
});
