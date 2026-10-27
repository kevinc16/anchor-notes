import '@/styles/delete-confirmation.css';

export async function confirmNoteDeletion(
  parent: HTMLElement = document.body,
  action: 'delete-note' | 'remove-highlight' = 'delete-note',
): Promise<boolean> {
  const label = action === 'remove-highlight' ? 'Remove highlight' : 'Delete note';
  const dialog = document.createElement('dialog');
  dialog.id = 'anchor-notes-delete-confirmation';
  dialog.setAttribute('aria-labelledby', 'anchor-delete-title');
  dialog.setAttribute('aria-describedby', 'anchor-delete-description');
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="anchor-delete-title">${label}?</h2>
      <p id="anchor-delete-description">This will delete the saved note and remove its highlight. This cannot be undone.</p>
      <footer>
        <button type="submit" value="cancel" autofocus>Cancel</button>
        <button type="submit" value="delete">${label}</button>
      </footer>
    </form>`;
  parent.appendChild(dialog);
  const closed = new Promise<boolean>((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once: true });
  });
  try {
    dialog.showModal();
    return await closed;
  } finally {
    dialog.remove();
  }
}
