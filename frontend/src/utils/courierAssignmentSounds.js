// Kurye Ataması Bildirim Sesleri - Web Audio API ile oluşturuluyor
// 5 farklı onay melodisi - hoş, pozitif sesler

const AudioContext = window.AudioContext || window.webkitAudioContext;

// Kurye ataması sesi çalma fonksiyonu (2 kez tekrar)
export const playCourierAssignmentSound = (soundId, volume = 1.0, repeatCount = 2) => {
  const ctx = new AudioContext();
  
  const playOnce = (startOffset) => {
    switch(soundId) {
      case 'onay1':
        playOnay1(ctx, volume, startOffset);
        break;
      case 'onay2':
        playOnay2(ctx, volume, startOffset);
        break;
      case 'onay3':
        playOnay3(ctx, volume, startOffset);
        break;
      case 'onay4':
        playOnay4(ctx, volume, startOffset);
        break;
      case 'onay5':
        playOnay5(ctx, volume, startOffset);
        break;
      default:
        playOnay1(ctx, volume, startOffset);
    }
  };
  
  // Sesi belirtilen sayıda tekrarla
  for (let i = 0; i < repeatCount; i++) {
    playOnce(i * 1.2); // Her tekrar arasında 1.2 saniye boşluk
  }
};

// Onay 1: Başarı Çanı - Kısa ve tatlı ding-ding
function playOnay1(ctx, volume, startOffset = 0) {
  const now = ctx.currentTime + startOffset;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.2;
  masterGain.connect(ctx.destination);
  
  // İki nota yükselen melodi
  const notes = [784, 1047]; // G5, C6
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.15;
    gain.gain.setValueAtTime(0.8, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(startTime);
    osc.stop(startTime + 0.4);
  });
}

// Onay 2: Neşeli Bip - Üç nota artan melodi
function playOnay2(ctx, volume, startOffset = 0) {
  const now = ctx.currentTime + startOffset;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.2;
  masterGain.connect(ctx.destination);
  
  const notes = [659, 784, 988]; // E5, G5, B5
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.12;
    gain.gain.setValueAtTime(0.7, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(startTime);
    osc.stop(startTime + 0.25);
  });
}

// Onay 3: Tatlı Melodi - Do-Mi-Sol arpeji
function playOnay3(ctx, volume, startOffset = 0) {
  const now = ctx.currentTime + startOffset;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.2;
  masterGain.connect(ctx.destination);
  
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    // Harmonik ekle
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    gain2.gain.value = 0.2;
    
    const startTime = now + i * 0.1;
    const duration = i === notes.length - 1 ? 0.5 : 0.15;
    
    gain.gain.setValueAtTime(0.6, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(masterGain);
    gain2.connect(masterGain);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
    osc2.start(startTime);
    osc2.stop(startTime + duration);
  });
}

// Onay 4: Hızlı Onay - Tek yüksek pozitif ton
function playOnay4(ctx, volume, startOffset = 0) {
  const now = ctx.currentTime + startOffset;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.2;
  masterGain.connect(ctx.destination);
  
  // Ana ton
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.linearRampToValueAtTime(1320, now + 0.1);
  osc.frequency.setValueAtTime(1320, now + 0.3);
  
  gain.gain.setValueAtTime(0.7, now);
  gain.gain.setValueAtTime(0.7, now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
  
  osc.connect(gain);
  gain.connect(masterGain);
  
  osc.start(now);
  osc.stop(now + 0.5);
  
  // Sparkle efekti
  const sparkle = ctx.createOscillator();
  const sparkleGain = ctx.createGain();
  sparkle.type = 'sine';
  sparkle.frequency.value = 2640;
  sparkleGain.gain.setValueAtTime(0.3, now + 0.15);
  sparkleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  sparkle.connect(sparkleGain);
  sparkleGain.connect(masterGain);
  sparkle.start(now + 0.15);
  sparkle.stop(now + 0.4);
}

// Onay 5: Küçük Fanfar - Mini zafer melodisi
function playOnay5(ctx, volume, startOffset = 0) {
  const now = ctx.currentTime + startOffset;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume * 1.2;
  masterGain.connect(ctx.destination);
  
  const melody = [
    { freq: 659, dur: 0.1 },   // E5
    { freq: 784, dur: 0.1 },   // G5
    { freq: 988, dur: 0.15 },  // B5
    { freq: 1319, dur: 0.35 }, // E6
  ];
  
  let time = now;
  
  melody.forEach(({ freq, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    // Harmonik
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.value = freq;
    gain2.gain.value = 0.3;
    
    gain.gain.setValueAtTime(0.7, time);
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

// Kurye ataması ses listesi
export const COURIER_ASSIGNMENT_SOUNDS = [
  { id: 'onay1', name: 'Onay 1 - Çan' },
  { id: 'onay2', name: 'Onay 2 - Neşeli' },
  { id: 'onay3', name: 'Onay 3 - Melodi' },
  { id: 'onay4', name: 'Onay 4 - Hızlı' },
  { id: 'onay5', name: 'Onay 5 - Fanfar' },
];

// Kurye ataması bildirim ayarlarını localStorage'dan al
export const getCourierAssignmentSettings = (restaurantId) => {
  try {
    const stored = localStorage.getItem(`courier_assignment_settings_${restaurantId}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Kurye ataması ayarları okunamadı:', e);
  }
  return { enabled: true, soundId: 'onay1', volume: 1.0 };
};

// Kurye ataması bildirim ayarlarını localStorage'a kaydet
export const saveCourierAssignmentSettings = (restaurantId, settings) => {
  try {
    localStorage.setItem(`courier_assignment_settings_${restaurantId}`, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('Kurye ataması ayarları kaydedilemedi:', e);
    return false;
  }
};
