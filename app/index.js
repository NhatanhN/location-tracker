import { StatusBar } from 'expo-status-bar'
import { Button, StyleSheet, Text, View } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import storage from "../globals/storage"
import { urlDevice, urlLocation } from '../globals/URLs'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import DebugControlPanel from '../components/DebugControlPanel'


const LOCATION_UPDATE = 'location-update'
const STAGE = 'dev'

// Defines the background task for periodically sending updates to the server. 
TaskManager.defineTask(LOCATION_UPDATE, async ({ data, error }) => {
  if (!data) return

  const { id, passkey } = await storage.load({ key: "device" })

  const location = data.locations.pop()
  const reqBody = {
    deviceID: id,
    passkey: passkey,
    longitude: location.coords.longitude,
    latitude: location.coords.latitude,
    timestamp: location.timestamp
  }

  fetch(urlLocation, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody)
  })

  storage.save({
    key: "location",
    data: {
      latestLat: reqBody.latitude,
      latestLong: reqBody.longitude,
      latestTimestamp: reqBody.timestamp
    }
  })
})

/**
 * Main application component
 */
export default function App() {
  // Loading state during initial data fetch
  const [isLoading, setIsLoading] = useState(true)

  // Device authentication data
  const [deviceID, setDeviceID] = useState()
  const [passkey, setPasskey] = useState()

  // Current tracking status
  const [isTracking, setIsTracking] = useState()
  // Time since tracking start, in ms since epoch
  const startTime = useRef()

  // Location permission status
  const [permissionsEnabled, setPermissionsEnabled] = useState(false)

  // Location data
  const [latitude, setLatitude] = useState()
  const [longitude, setLongitude] = useState()
  const timestamp = useRef() // ms since epoch

  // Time since tracking start in seconds
  const [timeSinceStart, setTimeSinceStart] = useState(0)
  // Time since last location ping in seconds
  const [timeSinceLastPing, setTimeSinceLastPing] = useState()

  //Interval to update timeSinceStart, timeSinceLastPing, and poll RN storage 
  //for location updates
  const [timerInterval, setTimerInterval] = useState()


  /**
   * Loads persisted state and sets intervals as needed
   */
  useEffect(() => {
    const loadDevice = storage.load({ key: "device" })
      .then(device => {
        setDeviceID(device.id)
        setPasskey(device.passkey)
      })
      .catch(err => console.err(err))

    const loadTracking = storage.load({ key: "trackingStart" })
      .then(data => {
        startTime.current = data.trackingStart
        setIsTracking(true)
        setPermissionsEnabled(true)

        if (timerInterval == null) {
          const interval = setInterval(() => {
            setTimeSinceStart((Date.now() - startTime.current) / 1000)
            setTimeSinceLastPing((Date.now() - timestamp.current) / 1000)

            storage.load({ key: "location" })
              .then(location => {
                setLongitude(location.latestLong)
                setLatitude(location.latestLat)
                timestamp.current = location.latestTimestamp
              }).catch(err => console.error(`useEffect interval ${err}`))
          }, 1000)
          setTimerInterval(interval)
        }
      })
      .catch(err => console.err(err))

    const loadLocation = storage.load({ key: "location" })
      .then(location => {
        setLongitude(location.latestLong)
        setLatitude(location.latestLat)
        timestamp.current = location.latestTimestamp
      })
      .catch(err => console.err(err))

    Promise.all([loadDevice, loadTracking, loadLocation]).finally(setIsLoading(false))

    return () => { if (timerInterval) clearInterval(timerInterval) }
  }, [])


  /**
   * Changes app state, sets persistent storage, sets a timer, and starts the location 
   * background task.
   */
  const turnOnTracking = () => {
    setIsTracking(true)
    const currentTime = Date.now()
    startTime.current = currentTime

    storage.save({
      key: "trackingStart",
      data: {
        trackingStart: startTime.current
      }
    })

    if (timerInterval == null) {
      const interval = setInterval(() => {
        setTimeSinceStart((Date.now() - startTime.current) / 1000)
        setTimeSinceLastPing((Date.now() - timestamp.current) / 1000)

        storage.load({ key: "location" })
          .then(location => {
            setLongitude(location.latestLong)
            setLatitude(location.latestLat)
            timestamp.current = location.latestTimestamp
          }).catch(err => console.error(`turnOn interval${err}`))
      }, 1000)
      setTimerInterval(interval)
    }

    // ensure the background task isn't already running
    Location.stopLocationUpdatesAsync(LOCATION_UPDATE)
      .finally(() => Location.startLocationUpdatesAsync(LOCATION_UPDATE, {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000 * 60 * 60 * 6, // 6 hours (only applies on android),
        pausesUpdatesAutomatically: true // variable time between updates (only applies to iOS)
      }))
  }


  /**
   * Resets app state, removes location-related persistent data, and stopping location background
   * tasks.
   */
  const turnOffTracking = () => {
    setIsTracking(false)
    startTime.current = NaN
    setTimeSinceStart(0)
    setTimeSinceLastPing()

    setLatitude()
    setLongitude()
    timestamp.current = NaN

    clearInterval(timerInterval)
    setTimerInterval()

    storage.remove({
      key: "trackingStart"
    })
    storage.remove({
      key: "location"
    })

    Location.stopLocationUpdatesAsync(LOCATION_UPDATE)
  }


  /**
   * Sets up the device by asking for location permissions and registering device with the backend 
   * server.
   */
  const setUp = async () => {
    // Request location permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus === 'granted') {
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus === 'granted') {
        setPermissionsEnabled(true)
      }
    }

    // Obtain a new device ID
    if (deviceID && passkey) return

    setDeviceID("Fetching new deviceID...")

    const characters = "abcdefghijklmnpqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("")
    let newPasskey = ""
    for (let i = 0; i < 6; i++) { // passkey length
      newPasskey += characters[Math.floor(Math.random() * characters.length)]
    }

    const res = await fetch(urlDevice, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        passkey: newPasskey
      })
    })

    // save to component state and persistent storage
    const newDeviceID = (await res.json()).deviceID

    setDeviceID(newDeviceID)
    setPasskey(newPasskey)
    storage.save({
      key: "device",
      data: {
        id: newDeviceID,
        passkey: newPasskey
      }
    })
  }

  
  if (isLoading) return (
    <View>
      <StatusBar style="light" translucent={false} />
      <Text>App is loading...</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent={false} />

      {/* Device statistics */}
      <Text>DeviceID: {deviceID}</Text>
      <Text>Passkey: {passkey}</Text>
      <Text>Status: {permissionsEnabled == false ? "Location services disabled"
        : isTracking ? "Currently Tracking"
          : "Currently Not Tracking"}
      </Text>

      {STAGE == "dev" &&
        <DebugControlPanel />
      }

      {/* Request location permissions button */}
      {permissionsEnabled == false &&
        <Button
          title="Enable location services"
          color={'#495db6'}
          onPress={setUp}
        />

      }

      {/* Tracking statistics */}
      {isTracking ?
        <>
          <Text>Tracking since{" "}
            {Math.floor(timeSinceStart / 86400) > 0 ? Math.floor(timeSinceStart / 86400) + " days, " : ""}
            {Math.floor(timeSinceStart / 3600 % 24) > 0 ? Math.floor(timeSinceStart / 3600 % 24) + " hours, " : ""}
            {Math.floor(timeSinceStart / 60 % 60) > 0 ? Math.floor(timeSinceStart / 60 % 60) + " minutes, " : ""}
            {Math.floor(timeSinceStart % 60)} seconds ago</Text>
          <Text>Time of last location ping:{" "}
            {Math.floor(timeSinceLastPing / 86400) > 0 ? Math.floor(timeSinceLastPing / 86400) + " days, " : ""}
            {Math.floor(timeSinceLastPing / 3600 % 24) > 0 ? Math.floor(timeSinceLastPing / 3600 % 24) + " hours, " : ""}
            {Math.floor(timeSinceLastPing / 60 % 60) > 0 ? Math.floor(timeSinceLastPing / 60 % 60) + " minutes, " : ""}
            {Math.floor(timeSinceLastPing % 60)} seconds ago</Text>
          <Text>Location: {`lat: ${latitude == null ? "N/A" : latitude}, long: ${longitude == null ? "N/A" : longitude}`}</Text>
          <Button
            title='Turn Off'
            color={'#495db6'}
            onPress={turnOffTracking}
          />

        </>
        :
        <>
          <Button
            title='Turn On'
            color={'#495db6'}
            onPress={turnOnTracking}
            disabled={permissionsEnabled == false || deviceID == "Fetching new deviceID..."}
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
