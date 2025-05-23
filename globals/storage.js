import Storage from 'react-native-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// initialize device storage
const storage = new Storage({
  storageBackend: AsyncStorage,
  defaultExpires: null
})

export default storage