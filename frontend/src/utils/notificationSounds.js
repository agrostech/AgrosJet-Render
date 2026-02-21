// Sipariş Bildirim Sesleri - Web Audio API ile oluşturuluyor
// 5 farklı yüksek sesli, uzun ve dikkat çekici melodi

const AudioContext = window.AudioContext || window.webkitAudioContext;

// Ses çalma fonksiyonu
export const playNotificationSound = (soundId, volume = 1.0) => {
  const ctx = new AudioContext();
  
  switch(soundId) {
    case 'ses1':
      playSound1(ctx, volume);
      break;
    case 'ses2':
      playSound2(ctx, volume);
      break;
    case 'ses3':
      playSound3(ctx, volume);
      break;
    case 'ses4':
      playSound4(ctx, volume);
      break;
    case 'ses5':
      playSound5(ctx, volume);
      break;
    default:
      playSound1(ctx, volume);
  }
};

// Ses 1: Güçlü Restoran Zili - Uzun ding-dong
function playSound1(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.5;
  masterGain.connect(ctx.destination);
  
  // 3 tekrarlı uzun zil
  for (let rep = 0; rep < 3; rep++) {
    const baseTime = now + rep * 0.8;
    const frequencies = [880, 660, 880, 1100, 880];
    let time = baseTime;
    
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(time);
      osc.stop(time + 0.25);
      
      time += 0.12;
    });
  }
}

// Ses 2: Acil Alarm - Kesintisiz bip sesleri
function playSound2(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.5;
  masterGain.connect(ctx.destination);
  
  // 12 adet hızlı bip
  for (let i = 0; i < 12; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.value = i % 2 === 0 ? 1200 : 1000;
    
    const startTime = now + i * 0.15;
    gain.gain.setValueAtTime(0.8, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.12);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(startTime);
    osc.stop(startTime + 0.12);
  }
}

// Ses 3: Yükselen Siren - Dikkat çekici
function playSound3(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.5;
  masterGain.connect(ctx.destination);
  
  // 2 tekrarlı siren
  for (let rep = 0; rep < 2; rep++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    const startTime = now + rep * 1.2;
    
    // Frekans yükselişi
    osc.frequency.setValueAtTime(400, startTime);
    osc.frequency.linearRampToValueAtTime(1200, startTime + 0.5);
    osc.frequency.linearRampToValueAtTime(400, startTime + 1.0);
    
    gain.gain.setValueAtTime(0.6, startTime);
    gain.gain.setValueAtTime(0.6, startTime + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 1.1);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(startTime);
    osc.stop(startTime + 1.1);
  }
}

// Ses 4: Çift Tonlu Alarm
function playSound4(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.5;
  masterGain.connect(ctx.destination);
  
  // 4 tekrarlı çift ton
  for (let rep = 0; rep < 4; rep++) {
    const baseTime = now + rep * 0.6;
    
    // Yüksek ton
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.value = 1000;
    gain1.gain.setValueAtTime(0.8, baseTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, baseTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(baseTime);
    osc1.stop(baseTime + 0.25);
    
    // Düşük ton
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.value = 700;
    gain2.gain.setValueAtTime(0.8, baseTime + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.01, baseTime + 0.5);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(baseTime + 0.25);
    osc2.stop(baseTime + 0.5);
  }
}

// Ses 5: Melodik Fanfar - Neşeli ama güçlü
function playSound5(ctx, volume) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.5;
  masterGain.connect(ctx.destination);
  
  // 2 tekrarlı melodi
  for (let rep = 0; rep < 2; rep++) {
    const baseTime = now + rep * 1.0;
    const melody = [
      { freq: 523, dur: 0.15 },
      { freq: 659, dur: 0.15 },
      { freq: 784, dur: 0.2 },
      { freq: 1047, dur: 0.15 },
      { freq: 784, dur: 0.15 },
      { freq: 1047, dur: 0.35 },
    ];
    
    let time = baseTime;
    
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
      gain2.gain.value = 0.4;
      
      gain.gain.setValueAtTime(0.9, time);
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
}

// Bildirim sesi listesi - Sadeleştirilmiş
export const NOTIFICATION_SOUNDS = [
  { id: 'ses1', name: 'Ses 1' },
  { id: 'ses2', name: 'Ses 2' },
  { id: 'ses3', name: 'Ses 3' },
  { id: 'ses4', name: 'Ses 4' },
  { id: 'ses5', name: 'Ses 5' },
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
  return { enabled: true, soundId: 'ses1', volume: 1.0 };
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

// Tarayıcı bildirim izni iste
export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    return { supported: false, permission: 'denied' };
  }
  
  if (Notification.permission === 'granted') {
    return { supported: true, permission: 'granted' };
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return { supported: true, permission };
  }
  
  return { supported: true, permission: Notification.permission };
};

// Bildirim izni durumunu kontrol et
export const getNotificationPermission = () => {
  if (!("Notification" in window)) {
    return 'unsupported';
  }
  return Notification.permission;
};
