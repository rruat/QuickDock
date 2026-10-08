// Abrir item (nota ou quadro) com a mesma animação
// ══ ABRIR ITEM: NOTA OU QUADRO (mesma animação de célula/coluna; muda só o conteúdo e a aside) ══
const asideModeFor = item => (item && item.kind === 'quadro') ? 'board' : 'note';

// Só quadros têm tratamento próprio; clicar numa nota segue abrindo a anotação do dia
const itemFromChip = target => {
  const chip = target.closest && target.closest('.cal-note-chip');
  const item = chip ? ITEM_BY_ID[chip.dataset.id] : null;
  return item && item.kind === 'quadro' ? item : null;
};

function setOpenItem(item, day, subLabel) {
  openItem = item;
  const isBoard = !!item && item.kind === 'quadro';
  inCellNotepad.classList.toggle('is-board', isBoard);
  sectionHeaderIcon.textContent = isBoard ? 'space_dashboard' : 'edit_note';
  sectionHeaderTitle.textContent = isBoard ? item.title : 'Nota';
  btnBackToCalendar.style.display = 'inline-flex';
  btnCloseNoteHeader.style.display = 'inline-flex';
  btnToggleRightAside.title = isBoard ? 'Painel do Quadro' : 'Painel da Nota';
  if (isBoard) {
    loadBoard(item);
    document.getElementById('asideBoardDateBadge').textContent = `Dia ${day} de Outubro`;
    document.getElementById('asideBoardSubDate').textContent = subLabel || 'Outubro de 2026';
    const g = document.getElementById('asideBoardGroup');
    g.dataset.group = item.group;
    g.textContent = GROUP_LABEL[item.group];
  }
}


