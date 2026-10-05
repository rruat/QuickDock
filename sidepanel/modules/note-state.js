// Refs de DOM do editor de nota compartilhados por vários módulos de note.js.
// Consultados uma única vez aqui — qualquer módulo que precise deles importa
// em vez de repetir o querySelector/getElementById.
export const noteSection  = document.querySelector('.note-section');
export const noteWorkspaceBodyEl = document.querySelector('.note-workspace-body');
export const noteEditorEl = document.querySelector('.note-editor');
export const root         = document.getElementById('note-editor-blocks');
export const indicator    = document.getElementById('save-indicator');
export const btnTouchSelect = document.getElementById('btn-touch-select');

let isCtrlHeld = false;
export function getIsCtrlHeld() { return isCtrlHeld; }
export function setIsCtrlHeld(v) { isCtrlHeld = Boolean(v); }
