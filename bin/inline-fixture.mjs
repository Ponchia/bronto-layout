/** Load explicitly authorized local test HTML as CDP data, never JavaScript source.
 * The caller retains the restricted-sandbox and BRONTO_TEST_INLINE_FIXTURE guards.
 */
export async function setInlineFixtureContent(cdp, navigationFrameId, html) {
  if (typeof html !== 'string') throw new TypeError('Inline test fixture must be HTML text');
  const frameId = navigationFrameId ?? (await cdp.send('Page.getFrameTree')).frameTree?.frame?.id;
  if (typeof frameId !== 'string' || !frameId) throw new Error('Inline test fixture has no document frame');
  await cdp.send('Page.setDocumentContent', { frameId, html });
}
