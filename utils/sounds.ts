class SoundManager {
  private sounds: { [key: string]: HTMLAudioElement } = {};
  private bgMusic: HTMLAudioElement | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.sounds = {
        click: new Audio('/sounds/click.mp3'),
        move: new Audio('/sounds/move.mp3'),
        win: new Audio('/sounds/win.mp3'),
        lose: new Audio('/sounds/lose.mp3'),
        draw: new Audio('/sounds/draw.mp3'),
        invite: new Audio('/sounds/invite.mp3'),
      };
      
      this.bgMusic = new Audio('/sounds/background.mp3');
      if (this.bgMusic) {
        this.bgMusic.loop = true;
        this.bgMusic.volume = 0.3;
      }
    }
  }

  playSound(soundName: keyof typeof this.sounds) {
    if (!this.isMuted && this.sounds[soundName]) {
      const sound = this.sounds[soundName].cloneNode() as HTMLAudioElement;
      sound.volume = 0.5;
      sound.play().catch(err => console.error('Error playing sound:', err));
    }
  }

  startBackgroundMusic() {
    if (!this.isMuted && this.bgMusic) {
      this.bgMusic.play().catch(err => console.error('Error playing background music:', err));
    }
  }

  stopBackgroundMusic() {
    if (this.bgMusic) {
      this.bgMusic.pause();
      this.bgMusic.currentTime = 0;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBackgroundMusic();
    } else {
      this.startBackgroundMusic();
    }
    return this.isMuted;
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.isMuted) {
      this.stopBackgroundMusic();
    } else {
      this.startBackgroundMusic();
    }
  }
}

export const soundManager = typeof window !== 'undefined' ? new SoundManager() : null;
