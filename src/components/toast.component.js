/**
 * toast.component.js - 全域 Toast 通知元件
 */

export class ToastComponent {
  constructor() {
    this.toastEl = document.getElementById('toast');
    this.messageEl = this.toastEl?.querySelector('.toast-message');
    this.timer = null;
  }

  show(message, isError = false) {
    if (!this.toastEl || !this.messageEl) return;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.messageEl.textContent = message;
    this.toastEl.className = 'toast' + (isError ? ' error' : '');
    this.toastEl.classList.add('show');

    this.timer = setTimeout(() => {
      this.toastEl.classList.remove('show');
      this.timer = null;
    }, 3200);
  }

  success(message) {
    this.show(message, false);
  }

  error(message) {
    this.show(message, true);
  }
}
