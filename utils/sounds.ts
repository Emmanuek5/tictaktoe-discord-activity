class SoundManager {
  private sounds: { [key: string]: HTMLAudioElement } = {};
  private currentTrack: HTMLAudioElement | null = null;
  private currentTrackIndex: number = 0;
  private isMuted: boolean = false;
  private readonly NUM_BG_TRACKS = 3; // Number of background tracks available

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
    }
  }

  playSound(soundName: keyof typeof this.sounds) {
    if (!this.isMuted && this.sounds[soundName]) {
      const sound = this.sounds[soundName].cloneNode() as HTMLAudioElement;
      sound.volume = 0.5;
      sound.play().catch(err => console.error('Error playing sound:', err));
    }
  }

  private initializeTrack(index: number): HTMLAudioElement {
    const track = new Audio(`/sounds/background-${index}.mp3`);
    track.loop = false; // Set to false since we'll handle the cycling
    track.volume = 0.3;
    track.addEventListener('ended', () => {
      this.playNextTrack();
    });
    return track;
  }

  private playNextTrack() {
    if (this.isMuted) return;
    
    // Stop current track if it exists
    if (this.currentTrack) {
      this.currentTrack.pause();
      this.currentTrack.currentTime = 0;
    }

    // Move to next track index
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.NUM_BG_TRACKS;

    // Initialize and play new track
    this.currentTrack = this.initializeTrack(this.currentTrackIndex + 1);
    this.currentTrack.play()
      .catch(err => console.error('Error playing background track:', err));
  }

  startBackgroundMusic() {
    if (!this.isMuted) {
      // Start with a random track
      this.currentTrackIndex = Math.floor(Math.random() * this.NUM_BG_TRACKS);
      this.currentTrack = this.initializeTrack(this.currentTrackIndex + 1);
      this.currentTrack.play()
        .catch(err => console.error('Error playing background music:', err));
    }
  }

  stopBackgroundMusic() {
    if (this.currentTrack) {
      this.currentTrack.pause();
      this.currentTrack.currentTime = 0;
      this.currentTrack = null;
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

  // Method to manually switch to next track
  switchTrack() {
    this.playNextTrack();
  }
}

export const soundManager = typeof window !== 'undefined' ? new SoundManager() : null;
