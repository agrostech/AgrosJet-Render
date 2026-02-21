// Sipariş Bildirim Sesleri - Web Audio API ile oluşturuluyor
// 5 farklı yüksek sesli, dikkat çekici melodi

const AudioContext = window.AudioContext || window.webkitAudioContext;

// Ses çalma fonksiyonu
export const playNotificationSound = (soundId, volume = 1.0) => {
  const ctx = new AudioContext();
  
  switch(soundId) {
    case 'alert1':
      playAlert1(ctx, volume);
      break;
    case 'alert2':
      playAlert2(ctx, volume);
      break;
    case 'alert3':
      playAlert3(ctx, volume);
      break;
    case 'alert4':
      playAlert4(ctx, volume);
      break;
    case 'alert5':
      playAlert5(ctx, volume);
      break;
    default:
      playAlert1(ctx, volume);
  }
};

// Ses 1: Klasik Restoran Zili - Ding Dong Ding
function playAlert1(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);
  
  const frequencies = [880, 660, 880, 1100, 880];
  const durations = [0.15, 0.15, 0.15, 0.2, 0.3];
  let time = now;
  
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + durations[i]);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(time);
    osc.stop(time + durations[i]);
    
    time += durations[i] + 0.05;
  });
}

// Ses 2: Acil Sipariş - Hızlı Bip Bip Bip
function playAlert2(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);
  
  for (let i = 0; i < 6; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.value = 1200;
    
    const startTime = now + i * 0.12;
    gain.gain.setValueAtTime(0.5, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.08);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(startTime);
    osc.stop(startTime + 0.08);
  }
}

// Ses 3: Mutfak Çağrısı - Yükselen Melodi
function playAlert3(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);
  
  const notes = [523, 659, 784, 1047, 1319, 1047, 784];
  let time = now;
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(time);
    osc.stop(time + 0.12);
    
    time += 0.1;
  });
}

// Ses 4: Dikkat Alarmı - Güçlü İkaz
function playAlert4(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);
  
  // İlk alarm
  for (let j = 0; j < 2; j++) {
    const baseTime = now + j * 0.5;
    
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.value = 800 + (i * 200);
      
      const startTime = baseTime + i * 0.1;
      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(startTime);
      osc.stop(startTime + 0.15);
    }
  }
}

// Ses 5: Sipariş Fanfar - Neşeli Bildirim
function playAlert5(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);
  
  const melody = [
    { freq: 523, dur: 0.1 },
    { freq: 659, dur: 0.1 },
    { freq: 784, dur: 0.15 },
    { freq: 659, dur: 0.1 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.25 },
  ];
  
  let time = now;
  
  melody.forEach(({ freq, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    // Harmonik ekle
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    gain2.gain.value = 0.3;
    
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
    
    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(masterGain);
    gain2.connect(masterGain);
    
    osc.start(time);
    osc.stop(time + dur);
    osc2.start(time);
    osc2.stop(time + dur);
    
    time += dur + 0.02;
  });
}

// Bildirim sesi listesi
export const NOTIFICATION_SOUNDS = [
  { id: 'alert1', name: 'Restoran Zili', description: 'Klasik ding-dong melodisi' },
  { id: 'alert2', name: 'Acil Sipariş', description: 'Hızlı bip sesleri' },
  { id: 'alert3', name: 'Mutfak Çağrısı', description: 'Yükselen melodi' },
  { id: 'alert4', name: 'Dikkat Alarmı', description: 'Güçlü ikaz sesi' },
  { id: 'alert5', name: 'Sipariş Fanfar', description: 'Neşeli bildirim' },
];

// Bildirim ayarlarını localStorage'dan al
export const getNotificationSettings = (restaurantId) => {
  try {
    const stored = localStorage.getItem(`notification_settings_${restaurantId}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Bildirim ayarları okunamadı:', e);
  }
  return { enabled: true, soundId: 'alert1', volume: 1.0 };
};

// Bildirim ayarlarını localStorage'a kaydet
export const saveNotificationSettings = (restaurantId, settings) => {
  try {
    localStorage.setItem(`notification_settings_${restaurantId}`, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('Bildirim ayarları kaydedilemedi:', e);
    return false;
  }
};
