export const noteSection  = document.querySelector('.note-section');

export const noteEditorEl = document.querySelector('.note-editor');

export const root         = document.getElementById('note-editor-blocks');

export const indicator    = document.getElementById('save-indicator');

export const mathCache    = new Map();

export const S = {
  currentNoteId: null,
  isCtrlHeld: false,
  activeMenu: null,
  indicatorTimer: null,
  saveTimer: null,
  rescanTimer: null,
  rescanBlock: null,
  undoStack: [],
  redoStack: [],
  pendingTypingSnapshot: null,
  typingSnapshotTimer: null,
  editingTemplate: null,
  imagePickerIntent: null,
  altMenuEl: null,
  slashMenuEl: null,
  slashItems: [],
  slashIndex: 0,
  slashBlock: null,
  linkMenuEl: null,
  hoveredBlock: null,
  selectedBlockIds: new Set(),
  lastHandleClickedId: null,
  selecaoEspelhada: false,
  blockMenuEl: null,
  pointerDown: null,
  reorderState: null,
  rangeSelectState: null,
  ctrlPointerDown: null,
};
