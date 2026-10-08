// Renderização inicial (aplica a view ativa) e atalhos de teclado
refreshAfterViewChange();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    handleCloseNote();
  }
});