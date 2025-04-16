import { StatusBar } from 'expo-status-bar'
import { Button, StyleSheet, Text, View } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import storage from "../globals/storage"
import { urlDevice, urlLocation } from '../globals/URLs'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'

/**
 * Todos:
 *  - Clean up code, variable declarations, using useReducer
 *  - possibly add obscure passkey and device id from always being visible 
 *  - maybe break this into two or more other components
 */

const LOCATION_UPDATE = 'location update'
const stage = 'dev'

// Defines the background task for periodically sending updates to the server. 
TaskManager.defineTask(LOCATION_UPDATE, async ({ data, error }) => {
  if (!data) return

  const { id, passkey } = await storage.load({ key: "device" })

  location = data.locations.pop()
  reqBody = {
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

export default function App() {
  const [isLoading, setIsLoading] = useState(true)

  // represents if the device is currently tracking location
  const [tracking, setTracking] = useState()

  // time since tracking started in ms since unix epoch
  const startTime = useRef()

  // time since tracking started in seconds
  const [timeSinceStart, setTimeSinceStart] = useState(0)

  // time since last location ping in seconds
  const [timeSinceLastPing, setTimeSinceLastPing] = useState()

  /**
   * interval where every second it:
   * 1. updates the value timeSinceStart
   * 2. updates the value for timeSinceLastPing
   * 3. updates location data by polling persistent storage
   */
  const [timerInterval, setTimerInterval] = useState()

  // represents if the device has given location permissions
  const [permissionsEnabled, setPermissionsEnabled] = useState(false)

  // represents data for the most recent location ping
  const [latitude, setLatitude] = useState()
  const [longitude, setLongitude] = useState()
  const timestamp = useRef()

  // metadata about the device
  const [deviceID, setDeviceID] = useState()
  const [passkey, setPasskey] = useState()

  /**
   * Load any state saved to persistent storage
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
        setTracking(true)
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
  }, [])

  /**
   * Changes app state, sets persistent storage, sets a timer, and starts the location 
   * background task.
   */
  const turnOnTracking = () => {
    setTracking(true)
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
    setTracking(false)
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
    for (i = 0; i < 6; i++) {
      newPasskey += characters[Math.floor(Math.random() * 62)]
    }

    res = await fetch(urlDevice, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        passkey: newPasskey
      })
    })

    // save to component state and persistent storage
    const json = await res.json()
    newDeviceID = json.deviceID

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

  /**
   * Debug function to clear all data stored in react native storage
   */
  const clearPersistentStorage = () => {
    storage.remove({ key: "device" })
    storage.remove({ key: "trackingStart" })
    storage.remove({ key: "location" })
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
        : tracking ? "Currently Tracking"
          : "Currently Not Tracking"}
      </Text>

      {stage == "dev" && <>
        <Button
          title="[DEBUG] clear persistent data"
          color={'#495db6'}
          onPress={clearPersistentStorage}

        />
        <Button
          title='[DEBUG] query location'
          color={'#495db6'}
          onPress={debugViewLocation}
          disabled={!tracking}
        />
      </>}

      {/* Request location permissions button */}
      {permissionsEnabled == false &&
        <Button
          title="Enable location services"
          color={'#495db6'}
          onPress={setUp}
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
