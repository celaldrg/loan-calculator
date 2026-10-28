/**
 * Browser side effects: file downloads, the clipboard and the address bar.
 */

/**
 * Lets the browser save a text file.
 * @param {string} filename suggested file name
 * @param {string} text file contents
 * @param {string} type media type, e.g. 'text/csv;charset=utf-8'
 */
export function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies text to the clipboard.
 * @param {string} text text to copy
 * @returns {Promise<boolean>} whether the browser allowed it
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Replaces the address bar URL without reloading or adding a history entry.
 * @param {string} url same-origin URL
 */
export function replaceUrl(url) {
  try {
    history.replaceState(null, '', url);
  } catch {
    // Some embedded contexts forbid it; the page works the same without it.
  }
}
