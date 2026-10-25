// Create a beep sound using Web Audio API
export function playSOSSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // 10 beeps alarm - bip bip bip bip (repeated)
    const beepDuration = 0.15; // 150ms beep
    const gapDuration = 0.1;   // 100ms gap
    const frequency = 1046.5;  // C6 - high frequency for alarm
    const volume = 0.4;

    for (let i = 0; i < 10; i++) {
      const time = now + i * (beepDuration + gapDuration);
      
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.frequency.value = frequency;
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      gain.gain.setValueAtTime(volume, time);
      gain.gain.setValueAtTime(volume, time + beepDuration - 0.01);
      gain.gain.setValueAtTime(0, time + beepDuration);
      
      osc.start(time);
      osc.stop(time + beepDuration);
    }
  } catch (err) {
    console.error('Failed to play SOS sound:', err);
  }
}

export function playAlertSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Simple alert beep - double beep
    [0, 0.15].forEach((offset) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.frequency.value = 800;
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.setValueAtTime(0, now + offset + 0.1);
      
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    });
  } catch (err) {
    console.error('Failed to play alert sound:', err);
  }
}

export function playTakenSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Ascending beep to indicate cancellation
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0, now + 0.15);
    
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setTargetAtTime(1200, now, 0.02);
    
    osc.start(now);
    osc.stop(now + 0.15);
  } catch (err) {
    console.error('Failed to play taken sound:', err);
  }
}
