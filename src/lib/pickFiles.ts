/**
 * Opens the system file picker. Must be called directly inside a tap handler,
 * otherwise phones block it. Resolves with [] if the user cancels.
 */
export function pickFiles(accept: string, opts: { multiple?: boolean; capture?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = opts.multiple ?? true;
    if (opts.capture) input.setAttribute('capture', 'environment');
    input.className = 'visually-hidden';
    document.body.appendChild(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => done([]));
    input.click();
  });
}

export const ACCEPT_IMAGES = 'image/*';
export const ACCEPT_PDF = 'application/pdf,.pdf';
export const ACCEPT_ANY = 'image/*,application/pdf,.pdf';
