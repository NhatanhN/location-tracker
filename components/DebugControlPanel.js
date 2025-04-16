import { Button, StyleSheet, Text, View } from 'react-native'
import storage from "../globals/storage"
import * as Location from 'expo-location'

/**
 * Component that contains controls to manually initiate debug events.
 */
export default function DebugControlPanel() {
  /**
   * Queries the location of the device and outputs it to console
   * 
   * May take seconds to resolve, depending on when the device sends the data
   */
  const debugViewLocation = async () => {
    console.log("DEBUG:")
    const locObj = await Location.getCurrentPositionAsync()

    console.log(` coords: ${Object.entries(locObj.coords)} | timestamp: ${locObj.timestamp}`)
    const { latitude, longitude } = locObj.coords

    // save data to RN storage
    storage.save({
      key: "location",
      data: {
        latestLat: latitude,
        latestLong: longitude,
        locationTimestamp: timestamp.current
      }
    })
  }

  /**
   * Clears all data stored in react native storage
   */
  const clearPersistentStorage = () => {
    const p1 = storage.remove({ key: "device" })
    const p2 = storage.remove({ key: "trackingStart" })
    const p3 = storage.remove({ key: "location" })

    Promise.all([p1, p2, p3])
      .then(res => console.log("persistent storage cleared"))
      .catch(rr => console.err(`[DebugControlPanel component]: ${err}`))
  }

  return (
    <View style={styles.container}>
      <Text>Debug Panel</Text>
      <Button
        title="Clear persistent data"
        color={'#495db6'}
        onPress={clearPersistentStorage}

      />
      <Button
        title='Query location'
        color={'#495db6'}
        onPress={debugViewLocation}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    gap: 8,
    borderWidth: 1,
    padding: 9,
  },
});