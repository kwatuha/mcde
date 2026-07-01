import { InteractionManager, Platform } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
  CameraOptions,
  ImageLibraryOptions,
} from 'react-native-image-picker';

/** Android often fails to open the camera immediately after a GPS/permission activity. */
async function deferBeforePicker(): Promise<void> {
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
  if (Platform.OS === 'android') {
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
}

export async function launchCameraDeferred(
  options: CameraOptions
): Promise<ImagePickerResponse> {
  await deferBeforePicker();
  return new Promise((resolve) => {
    launchCamera(options, resolve);
  });
}

export async function launchLibraryDeferred(
  options: ImageLibraryOptions
): Promise<ImagePickerResponse> {
  await deferBeforePicker();
  return new Promise((resolve) => {
    launchImageLibrary(options, resolve);
  });
}
