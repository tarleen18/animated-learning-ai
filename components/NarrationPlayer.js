import { useEffect, useState } from 'react';

export default function NarrationPlayer({ storyboard }) {
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!playing || !storyboard?.length) return;

    const speakScene = (index) => {
      const scene = storyboard[index];
      if (!scene) {
        setPlaying(false);
        return;
      }

      setCurrentScene(index);
      const utterance = new SpeechSynthesisUtterance(scene.narration || scene.onScreenText || '');
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        if (index + 1 < storyboard.length) {
          speakScene(index + 1);
        } else {
          setPlaying(false);
        }
      };

      window.speechSynthesis.speak(utterance);
    };

    window.speechSynthesis.cancel();
    speakScene(0);
  }, [playing, storyboard]);

  const handlePlay = () => {
    if (!supported || !storyboard?.length) return;
    window.speechSynthesis.cancel();
    setPlaying(true);
  };

  const handleStop = () => {
    if (supported) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
    setCurrentScene(0);
  };

  if (!storyboard || storyboard.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <div>
          <h3 style={styles.heading}>Narration Player</h3>
          <p style={styles.text}>Hear the storyboard narration read aloud by your browser.</p>
        </div>
        <div style={styles.buttonGroup}>
          <button style={styles.button} onClick={handlePlay} disabled={!supported || playing}>
            {playing ? 'Playing…' : 'Play Narration'}
          </button>
          <button style={styles.buttonSecondary} onClick={handleStop} disabled={!supported || !playing}>
            Stop
          </button>
        </div>
      </div>
      <p style={styles.status}>
        {supported ? `Current scene: ${storyboard[currentScene]?.number || 1}` : 'Speech synthesis not supported in this browser.'}
      </p>
    </div>
  );
}

const styles = {
  container: {
    marginTop: '1.5rem',
    padding: '1.25rem',
    borderRadius: 20,
    background: '#ffffff',
    border: '1px solid #e2e8f0'
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'center'
  },
  heading: {
    margin: 0,
    fontSize: '1.1rem'
  },
  text: {
    margin: '0.25rem 0 0',
    color: '#475569'
  },
  buttonGroup: {
    display: 'flex',
    gap: '0.75rem'
  },
  button: {
    padding: '0.75rem 1rem',
    borderRadius: 16,
    border: 'none',
    background: '#2563eb',
    color: 'white',
    cursor: 'pointer'
  },
  buttonSecondary: {
    padding: '0.75rem 1rem',
    borderRadius: 16,
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#1f2937',
    cursor: 'pointer'
  },
  status: {
    margin: '1rem 0 0',
    color: '#334155'
  }
};
