import { Composition } from 'remotion';
import { Main } from './Composition';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={Main}
        durationInFrames={240} // 8 seconds at 30 FPS
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
