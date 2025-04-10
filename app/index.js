import { StatusBar } from 'expo-status-bar'
import { Button, StyleSheet, Text, View } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import storage from "../globals/storage"
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'

// Name for background tasks
const LOCATION_UPDATE = 'location update'

// Defines the background task for periodically sending updates to the server. 
// Meant to perform across intervals of 6 hours or so
TaskManager.defineTask(LOCATION_UPDATE, ({ data, error }) => {
  if (data) {
    const { locations } = data;
    // TODO:
    // have this send location data to the backend periodically
  }
});

// Load persisted data
let pTrackingStart, pLat, pLong, pTimestamp
storage.getBatchData([
  { key: "trackingStart" },
  { key: "location" }
]).then(res => {
  pTrackingStart = res[0]["trackingStart"]
  pLat = res[1]["latestLat"]
  pLong = res[1]["latestLong"]
  pTimestamp = res[1]["locationTimestamp"]
}).catch(err => {
  if (err.name == 'NotFoundError') return
  console.error(`Error in loading persisted tracking data :: ${err}`)
})

// TODO:
// have the app generate its own device ID and obtain its passkey 
// from the backend
export default function App() {
  // represents if the device is currently tracking location
  const [tracking, setTracking] = useState(pTrackingStart != null)

  // represents the time when tracking had been turned on in ms since unix epoch
  const startTime = useRef(pTrackingStart ?? NaN)

  // represents the time since tracking had been turned on in seconds
  const [timeSinceStart, setTimeSinceStart] = useState(0)

  // represents time since last location ping in seconds
  const [timeSinceLastPing, setTimeSinceLastPing] = useState()

  // pointer to the interval that updates timeSinceStart and timeSinceLastPing periodically
  const [timerInverval, setTimerInverval] = useState()

  // represents if the device has given location permissions
  const [permissionsEnabled, setPermissionsEnabled] = useState(pTrackingStart != null)

  // represents data for the most recent location ping
  const [latitude, setLatitude] = useState(pLat)
  const [longitude, setLongitude] = useState(pLong)
  const timestamp = useRef(pTimestamp ?? NaN)

  useEffect(() => {
    // If the application had been tracking location data since before app open,
    // the intervals to update timeSinceStart and timeSinceLastPing should be rerun
    if (pTrackingStart != null) {
      const interval = setInterval(() => {
        setTimeSinceStart((Date.now() - startTime.current) / 1000)
        setTimeSinceLastPing((Date.now() - timestamp.current) / 1000)
      }, 1000)
      setTimerInverval(interval)
    }
  }, [])

  const turnOnTracking = () => {
    setTracking(true)
    const currentTime = Date.now()
    startTime.current = currentTime

    // save data to RN storage
    storage.save({
      key: "trackingStart",
      data: {
        trackingStart: startTime.current
      }
    })

    // set an interval to update timeSinceStart, timeSinceLastPing every so often
    const interval = setInterval(() => {
      setTimeSinceStart((Date.now() - startTime.current) / 1000)
      setTimeSinceLastPing((Date.now() - timestamp.current) / 1000)
    }, 100)
    setTimerInverval(interval)

    /*
    // enable the background task to send location updates periodically
    Location.startLocationUpdatesAsync(LOCATION_UPDATE, {
      accuracy: Location.Accuracy.High,
      timeInterval: 1000 * 60 * 60 * 6, // 6 hours (only applies on android),
      pausesUpdatesAutomatically: true // variable time between updates (only applies to iOS)
    })
     */
  }

  const turnOffTracking = () => {
    setTracking(false)
    startTime.current = NaN
    setTimeSinceStart(0)
    setTimeSinceLastPing()
    clearInterval(timerInverval)
    setLatitude()
    setLongitude()
    timestamp.current = NaN

    storage.remove({
      key: "trackingStart"
    })
    storage.remove({
      key: "location"
    })
  }

  const requestLocationPermissions = async () => {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus === 'granted') {
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus === 'granted') {
        setPermissionsEnabled(true)
      }
    }
  }

  /**
   * Debug function that queries the location of the device and outputs it to console
   * 
   * May take seconds to resolve, depending on when the device sends the data
   */
  const debugViewLocation = async () => {
    console.log("DEBUG:")
    const locObj = await Location.getCurrentPositionAsync()

    console.log(` coords: ${Object.entries(locObj.coords)} | timestamp: ${locObj.timestamp}`)
    const { latitude, longitude } = locObj.coords

    setLatitude(latitude)
    setLongitude(longitude)
    timestamp.current = locObj.timestamp

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

  return (
    <View style={styles.container}>
      {/* Device statistics */}
      <StatusBar style="auto" />
      <Text>DeviceID: </Text>
      <Text>Passkey: </Text>
      <Text>Status: {permissionsEnabled == false ? "Location services disabled"
        : tracking ? "Currently Tracking"
          : "Currently Not Tracking"}
      </Text>

      {/* Request location permissions button */}
      {permissionsEnabled == false &&
        <Button
          title="Enable location services"
          color={'#495db6'}
          onPress={requestLocationPermissions}
        />
      }

      {/* Tracking statistics */}
      {tracking ?
        <>
          <Text>Tracking since{" "}
            {Math.floor(timeSinceStart / 86400) > 0 ? Math.floor(timeSinceStart / 86400) + " days, " : ""}
            {Math.floor(timeSinceStart / 3600 % 24) > 0 ? Math.floor(timeSinceStart / 3600 % 24) + " hours, " : ""}
            {Math.floor(timeSinceStart / 60 % 60) > 0 ? Math.floor(timeSinceStart / 60 % 60) + " minutes, " : ""}
            {Math.floor(timeSinceStart % 60)} seconds ago</Text>
          <Text>Location pinged{" "}
            {Math.floor(timeSinceLastPing / 86400) > 0 ? Math.floor(timeSinceLastPing / 86400) + " days, " : ""}
            {Math.floor(timeSinceLastPing / 3600 % 24) > 0 ? Math.floor(timeSinceLastPing / 3600 % 24) + " hours, " : ""}
            {Math.floor(timeSinceLastPing / 60 % 60) > 0 ? Math.floor(timeSinceLastPing / 60 % 60) + " minutes, " : ""}
            {Math.floor(timeSinceLastPing % 60)} seconds ago</Text>
          <Text>Last pinged location: {`lat: ${latitude == null ? "N/A" : latitude}, long: ${longitude == null ? "N/A" : longitude}`}</Text>
          <Button
            title='Turn Off'
            color={'#495db6'}
            onPress={turnOffTracking}
          />
          <Button
            title='[DEBUG] query location'
            color={'#495db6'}
            onPress={debugViewLocation}
          />
        </>
        :
        <>
          <Button
            title='Turn On'
            color={'#495db6'}
            onPress={turnOnTracking}
            disabled={permissionsEnabled == false}
          />
        </>
      }

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: 'flex',
    flexGrow: 1,
    gap: 8,
    backgroundColor: '#eee',
    padding: 15
  },
});
