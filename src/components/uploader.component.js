/**
 * uploader.component.js - 拖曳上傳與檔案選擇展示元件
 */
import { formatFileSize } from '../utils/format.util.js';

export class UploaderComponent {
  constructor({ onFileSelected }) {
    this.dropZone = document.getElementById('drop-zone');
    this.fileInput = document.getElementById('file-input');
    this.selectedFileInfo = document.getElementById('selected-file-info');
    this.displayFileName = document.getElementById('display-file-name');
    this.displayFileSize = document.getElementById('display-file-size');
    this.btnConvert = document.getElementById('btn-convert');

    this.onFileSelected = onFileSelected;
    this.selectedFile = null;

    this.bindEvents();
  }

  bindEvents() {
    // 拖曳視覺反饋
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('drag-active');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('drag-active');
      }, false);
    });

    // 放置檔案
    this.dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFile(files[0]);
      }
    });

    // 點擊觸發檔案選擇
    this.dropZone.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
        this.fileInput.value = '';
      }
    });

    // 手動轉換按鈕
    this.btnConvert?.addEventListener('click', () => {
      if (this.selectedFile && this.onFileSelected) {
        this.onFileSelected(this.selectedFile);
      }
    });
  }

  handleFile(file) {
    this.selectedFile = file;
    if (this.displayFileName) this.displayFileName.textContent = file.name;
    if (this.displayFileSize) this.displayFileSize.textContent = formatFileSize(file.size);
    if (this.selectedFileInfo) this.selectedFileInfo.style.display = 'flex';

    if (this.onFileSelected) {
      this.onFileSelected(file);
    }
  }

  reset() {
    this.selectedFile = null;
    if (this.selectedFileInfo) this.selectedFileInfo.style.display = 'none';
  }
}
