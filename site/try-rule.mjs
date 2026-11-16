/** Progressive enhancement; the static tutorial and captured evidence work without it. */
const controls = document.getElementById('try-controls');
const status = document.getElementById('try-status');
try {
  const { evaluateLayout } = await import('./assets/layout-core.js');
  const stage = document.getElementById('try-stage');
  const image = document.getElementById('try-image');
  const paragraph = document.getElementById('try-paragraph');
  const offset = document.getElementById('try-offset');
  const rule = { id: 'image-top-aligns-to-paragraph', type: 'align-edge', a: 'paragraph', b: 'image', edgeA: 'top', tolerance: 2 };
  function update() {
    try {
      image.style.transform = `translateY(${Number(offset.value)}px)`;
      const rect = stage.getBoundingClientRect();
      const geometry = (node, name) => {
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) throw new Error('Unavailable measurement');
        return [{ path: `#${name}`, tag: node.tagName.toLowerCase(), rect: { x: box.x - rect.x, y: box.y - rect.y, width: box.width, height: box.height } }];
      };
      const report = evaluateLayout({ viewport: { width: innerWidth, height: innerHeight, direction: 'ltr' }, document: { width: rect.width, height: rect.height }, selectors: { paragraph: geometry(paragraph, 'try-paragraph'), image: geometry(image, 'try-image') } }, [rule]);
      const finding = report.findings[0];
      const measured = Number(finding.deviation.toFixed(2));
      document.getElementById('try-value').value = `${offset.value}px`;
      document.getElementById('try-measured').textContent = `${measured} CSS pixels`;
      const verdict = document.getElementById('try-verdict');
      verdict.textContent = finding.status.toUpperCase();
      verdict.dataset.result = finding.status;
      status.textContent = `${finding.status === 'pass' ? 'Pass' : 'Fail'}: top edges differ by ${measured} CSS pixels. The approved tolerance is 2px.`;
      for (const button of document.querySelectorAll('[data-offset]')) button.setAttribute('aria-pressed', String(button.dataset.offset === offset.value));
      stage.dataset.result = finding.status;
    } catch {
      document.getElementById('try-verdict').textContent = 'Unverified';
      document.getElementById('try-measured').textContent = 'Unavailable';
      status.textContent = 'The relationship could not be measured. This is not a passing result.';
      delete stage.dataset.result;
    }
  }
  offset.addEventListener('input', update);
  for (const button of document.querySelectorAll('[data-offset]')) button.addEventListener('click', () => { offset.value = button.dataset.offset; update(); });
  new ResizeObserver(update).observe(stage);
  controls.hidden = false;
  document.getElementById('try-readout').hidden = false;
  update();
} catch {
  status.textContent = 'The interactive evaluator could not load. The static tutorial and captured CLI results below are still available.';
}
