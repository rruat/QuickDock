// Seletor de fonte da nota (Aparência): lista padrão + campo para qualquer outra fonte do Google Fonts.
import { updateNoteMetaById } from './storage.js';
import { NOTE_FONTS, fonteValida, carregarFonte, aplicarFonteDaNota } from './note-font.js';
import { getNotesMeta, getActiveId } from './notes-tabs.js';

/** `onChanged` roda depois de gravar (para a seção se redesenhar). */
export function buildFontPicker(meta, onChanged) {
  const wrap = document.createElement('div');
  wrap.className = 'note-font-picker';

  const titulo = document.createElement('div');
  titulo.className = 'note-cover-section-label';
  titulo.textContent = 'Fonte da nota';
  wrap.appendChild(titulo);

  const grade = document.createElement('div');
  grade.className = 'note-font-grid';
  wrap.appendChild(grade);

  const erro = document.createElement('div');
  erro.className = 'note-font-error';
  erro.hidden = true;

  async function escolher(nome) {
    await updateNoteMetaById(meta.id, { font: nome });
    meta.font = nome;
    const real = getNotesMeta().find(n => n.id === meta.id);
    if (real && real !== meta) real.font = nome;
    if (meta.id === getActiveId()) aplicarFonteDaNota(nome);
    onChanged?.();
  }

  const botao = (nome, rotulo, estilo, dica) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-font-option' + ((meta.font || null) === nome ? ' active' : '');
    b.textContent = rotulo;
    if (estilo) { carregarFonte(estilo); b.style.fontFamily = `"${estilo}", var(--font)`; }
    if (dica) b.title = dica;
    b.addEventListener('mousedown', e => e.stopPropagation());
    b.addEventListener('click', e => { e.stopPropagation(); escolher(nome); });
    return b;
  };

  grade.appendChild(botao(null, 'Padrão do app', null, 'Volta para a fonte do QuickDock'));
  for (const f of NOTE_FONTS) grade.appendChild(botao(f.name, f.name, f.name, f.kind));
  if (meta.font && !NOTE_FONTS.some(f => f.name === meta.font)) {
    grade.appendChild(botao(meta.font, meta.font, meta.font, 'Fonte própria'));
  }

  const linha = document.createElement('div');
  linha.className = 'note-font-custom';
  const campo = document.createElement('input');
  campo.type = 'text';
  campo.className = 'property-input';
  campo.placeholder = 'Outra fonte do Google Fonts (ex.: Crimson Text)';
  campo.setAttribute('aria-label', 'Nome de outra fonte do Google Fonts');
  campo.spellcheck = false;
  campo.addEventListener('mousedown', e => e.stopPropagation());
  const aplicar = document.createElement('button');
  aplicar.type = 'button';
  aplicar.className = 'calendar-action-btn primary';
  aplicar.textContent = 'Usar';
  const usar = () => {
    const nome = campo.value.trim().replace(/\s+/g, ' ');
    if (!fonteValida(nome)) { erro.textContent = 'Digite o nome exatamente como no Google Fonts (só letras, números e espaços).'; erro.hidden = false; return; }
    erro.hidden = true;
    escolher(nome);
  };
  aplicar.addEventListener('click', e => { e.stopPropagation(); usar(); });
  campo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); usar(); } });
  linha.append(campo, aplicar);
  wrap.append(linha, erro);

  const dica = document.createElement('div');
  dica.className = 'note-font-hint';
  dica.textContent = 'Se o nome não existir no Google Fonts, a nota continua com a fonte padrão.';
  wrap.appendChild(dica);
  return wrap;
}
