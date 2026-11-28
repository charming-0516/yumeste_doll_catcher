const GameVoice = (() => {
  let context = null;
  let current = null;
  let generation = 0;
  const buffers = new Map();

  function load(src) {
    if (!buffers.has(src)) {
      const task = fetch(src)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Audio HTTP ${response.status}`);
          }
          return response.arrayBuffer();
        })
        .then(data => context.decodeAudioData(data))
        .catch(error => {
          buffers.delete(src);
          throw error;
        });

      buffers.set(src, task);
    }

    return buffers.get(src);
  }

  function unlock() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      if (!context) {
        context = new AudioContextClass();
      }

      if (context.state !== "running") {
        context.resume().catch(console.warn);

        const silent = context.createBufferSource();
        silent.buffer = context.createBuffer(
          1, 1, context.sampleRate
        );
        silent.connect(context.destination);
        silent.start(0);
      }

      for (const data of Object.values(REWARD_DATA)) {
        if (data.voice) {
          load(data.voice).catch(error => {
            console.warn("音声読み込み失敗:", error);
          });
        }
      }
    } catch (error) {
      console.warn("Audio initialization failed:", error);
    }
  }

  function stop() {
    generation++;

    if (current) {
      try {
        current.stop();
      } catch (_) {}

      current.disconnect();
      current = null;
    }
  }

  async function play(src) {
    stop();
    const token = generation;

    try {
      if (!context) return;

      const buffer = await load(src);

      if (token !== generation) return;

      if (context.state !== "running") {
        await context.resume();
      }

      if (token !== generation) return;

      const source = context.createBufferSource();
      const gain = context.createGain();

      source.buffer = buffer;
      gain.gain.value = 0.8;

      source.connect(gain);
      gain.connect(context.destination);

      current = source;

      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (current === source) current = null;
      };

      source.start(0);
    } catch (error) {
      console.warn("音声再生失敗:", error);
    }
  }

  document.addEventListener("click", unlock, true);
  document.addEventListener("touchend", unlock, true);
  document.addEventListener("keydown", unlock, true);

  return { unlock, play, stop };
})();
