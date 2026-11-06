export const tabsEl        = document.getElementById('notes-tabs');

export const btnNew        = document.getElementById('btn-new-note');

export const btnNotesList  = document.getElementById('btn-notes-list');

export const importInput   = document.getElementById('note-import-input');

export const noteEditorEl  = document.querySelector('.note-editor');

export const noteSection   = document.querySelector('.note-section');

export const S = {
  notesMeta: [],
  activeId: null,
  noteDragSrcId: null,
  tabDropIndicatorEl: null,
  tabMenuEl: null,
  tabMenuAppearanceOpen: false,
  listDropIndicatorEl: null,
  newMenuPopover: null,
  editingTpl: null,
  returnNoteId: null,
};
