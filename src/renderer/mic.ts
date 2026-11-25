import { floatToPcm16, resampleLinear, VOICE_SAMPLE_RATE } from "../shared/voice-audio";

const FRAME = 1280;

/**
 * Capture the microphone in the renderer. Samples are 16 kHz PCM16.
 * The caller sends them to the main process. They are not uploaded from here.
 */
export async function startMicrophone(onPcm: (pcm: ArrayBuffer) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  const context = new AudioContext();
  if (context.state === "suspended") await context.resume();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  let pending = new Int16Array(0);
  processor.onaudioprocess = (event) => {
    const channel = event.inputBuffer.getChannelData(0);
    const resampled = resampleLinear(channel, context.sampleRate, VOICE_SAMPLE_RATE);
    const pcm = floatToPcm16(resampled);
    const merged = new Int16Array(pending.length + pcm.length);
    merged.set(pending);
    merged.set(pcm, pending.length);
    let offset = 0;
    while (merged.length - offset >= FRAME) {
      const frame = merged.slice(offset, offset + FRAME);
      onPcm(frame.buffer);
      offset += FRAME;
    }
    pending = merged.slice(offset);
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  return () => {
    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    mute.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void context.close();
  };
}
