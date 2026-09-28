import { escapeHtml, oneLine } from './escape-html.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('neutralises a script injection attempt', () => {
    const escaped = escapeHtml(
      '<img src=x onerror="alert(1)"><script>x</script>',
    );
    expect(escaped).not.toMatch(/[<>"]/);
  });

  it('escapes & first, so existing entities are not left active', () => {
    expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;');
  });

  it('leaves plain text, accents and emoji untouched', () => {
    expect(escapeHtml('Équipe Produit 🚀')).toBe('Équipe Produit 🚀');
  });
});

describe('oneLine', () => {
  it('removes line breaks that could inject email headers', () => {
    expect(oneLine('Hello\r\nBcc: victim@example.com')).toBe(
      'Hello Bcc: victim@example.com',
    );
  });
});
