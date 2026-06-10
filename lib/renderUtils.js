const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

function escapeFfmpegText(text) {
  return String(text || '')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function getFontFile() {
  if (process.platform === 'win32') {
    return 'C:/Windows/Fonts/arial.ttf';
  }
  if (process.platform === 'darwin') {
    return '/Library/Fonts/Arial.ttf';
  }
  return '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
}

async function createSlide({ outputPath, scene, index }) {
  const backgroundColors = ['blue', 'purple', 'teal', 'orange', 'green'];
  const bg = backgroundColors[index % backgroundColors.length];
  const title = `Scene ${scene.number}`;
  const body = scene.onScreenText || scene.visualDescription || scene.narration || '';
  const escapedTitle = escapeFfmpegText(title);
  const escapedBody = escapeFfmpegText(body);
  const fontFile = getFontFile();
  const fontExists = await fs.access(fontFile).then(() => true).catch(() => false);
  const titleFilter = fontExists
    ? `drawtext=fontfile=${fontFile}:text='${escapedTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=80:box=1:boxcolor=0x00000099:boxborderw=10`
    : `drawtext=text='${escapedTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=80:box=1:boxcolor=0x00000099:boxborderw=10`;
  const bodyFilter = fontExists
    ? `drawtext=fontfile=${fontFile}:text='${escapedBody}':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=0x00000099:boxborderw=10`
    : `drawtext=text='${escapedBody}':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=0x00000099:boxborderw=10`;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=${bg}:s=1280x720:d=${scene.duration || 5}`)
      .inputOptions(['-f lavfi'])
      .videoFilters([titleFilter, bodyFilter])
      .outputOptions(['-pix_fmt yuv420p', '-movflags +faststart'])
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

async function concatVideos(videoPaths, outputPath) {
  const concatFile = path.join(path.dirname(outputPath), 'concat.txt');
  const lines = videoPaths.map((videoPath) => `file '${videoPath.replace(/\\/g, '/')}'`).join('\n');
  await fs.writeFile(concatFile, lines, 'utf8');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

async function renderLessonToFile(lesson) {
  const tempDir = path.join(os.tmpdir(), 'animated-learning', `${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const sceneFiles = await Promise.all(
    lesson.storyboard.map(async (scene, index) => {
      const outputPath = path.join(tempDir, `slide-${index + 1}.mp4`);
      await createSlide({ outputPath, scene, index });
      return outputPath;
    })
  );

  const outputPath = path.join(tempDir, 'lesson-video.mp4');
  await concatVideos(sceneFiles, outputPath);
  return { tempDir, outputPath };
}

module.exports = { createSlide, concatVideos, renderLessonToFile };
