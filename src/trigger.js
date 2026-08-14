(() => {
  const source = 'colombian-shooter-extension';

  window.runColombianShooter = () => {
    window.postMessage({ source, type: 'run' }, '*');
  };
})();
