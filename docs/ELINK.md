# 🧠 ELINK Gateway Summary — MQTT Connectivity

## 1. Overview

**ELINK 网关 (ELINK Gateway)** is an industrial IoT gateway used to collect data from **injection molding machines** and publish it via multiple protocols:

* **MQTT** (for cloud or local data collection)
* **OPC UA**
* **Modbus TCP**
* **HTTP API**

There are two main models:

* **ELINK102** – for serial communication devices
* **ELINK301** – for Ethernet (network port) communication devices

Both share the same configuration process and data schema.

---

## 2. Default Network Configuration

| Interface | Default IP        | Notes                           |
| --------- | ----------------- | ------------------------------- |
| WLAN      | `192.168.1.233`   | Main configuration access point |
| LAN       | `192.168.233.254` | Alternate wired port            |

**Default login:**

* URL: `http://192.168.1.233`
* Username: `admin`
* Password: `admin123`

The gateway supports **Ethernet**, **Wi-Fi**, and **4G** communication modes.

---

## 3. MQTT Communication Setup

### Steps to connect ELINK to an MQTT broker:

1. Access the configuration UI at `http://192.168.1.233`.

2. Go to **Network Settings** → set static IP, gateway, or DHCP.

3. Under **Device & Server Settings**, set:

   * **Device ID** (unique per machine)
   * **MQTT Server Address** (IP or domain of your broker)
   * **Port** (default `1883`)
   * **Topic Prefix** (optional namespace)
   * **Push Interval** (data update frequency)

4. Save & reboot the gateway.

> ⚠️ **Important:** ELINK only supports **unencrypted MQTT (TCP/1883)** — no MQTT over TLS/SSL (8883).
> If HTTPS/TLS is required, a **VPN or TLS bridge** must be used externally.

---

## 4. MQTT Topics and Payloads

### 4.1. Process Data (`/spc`)

**Topic:**

```
<MqttPrefix>/<deviceId>/spc
```

**Example variables:**

| Tag     | Meaning                | Example |
| ------- | ---------------------- | ------- |
| `CYCN`  | Cycle number           | 12543   |
| `ECYCT` | Cycle time (s)         | 12.5    |
| `EIPM`  | Max injection pressure | 168.2   |
| `EIVM`  | Max injection speed    | 101.5   |
| `EPLST` | Plasticizing time      | 6.3     |

---

### 4.2. Realtime Status (`/realtime`)

**Topic:**

```
<MqttPrefix>/<deviceId>/realtime
```

**Key values:**

| Tag      | Meaning                  | Range                                                        |
| -------- | ------------------------ | ------------------------------------------------------------ |
| `OPM`    | Operation mode           | 0=Manual / 1=Semi-auto / 2=Eye auto / 3=Timer auto / 4=Setup |
| `STS`    | Machine status           | 1=Standby / 2=Running                                        |
| `T1…T10` | Barrel temperature zones | °C                                                           |
| `OT`     | Oil temperature          | °C                                                           |

---

### 4.3. Process Settings (`/tech`)

**Topic:**

```
<MqttPrefix>/<deviceId>/tech
```

Contains all molding process setpoints (pressure, speed, position, time, etc.).

**Example tags:**

| Tag                 | Description                          |
| ------------------- | ------------------------------------ |
| `TS1…TS10`          | Temperature setpoints                |
| `IP1…IP10`          | Injection pressure setpoints         |
| `IV1…IV10`          | Injection speed setpoints            |
| `IS1…IS10`          | Injection position setpoints         |
| `IT1…IT10`          | Injection time per step              |
| `IPP`, `IPS`, `IPT` | Pressure/position/time switch points |
| `PP1…PP10`          | Hold pressure                        |
| `PV1…PV10`          | Hold speed                           |
| `CT`                | Cooling time                         |
| `MCV1…MCV10`        | Clamp speeds                         |
| `MOV1…MOV10`        | Open speeds                          |

---

### 4.4. Operation Log (`/opLog`)

**Topic:**

```
<MqttPrefix>/<deviceId>/opLog
```

Logs parameter modifications.

**Payload Example:**

```json
{
  "devId": "5",
  "time": "2022-12-09 12:09:48",
  "Data": {
    "varId": "SIPS",
    "value": 37.5,
    "lastValue": 37,
    "modifyTime": "2022-12-09 12:09:46"
  }
}
```

---

### 4.5. Alarm Messages (`/wm`)

**Topic:**

```
<MqttPrefix>/<deviceId>/wm
```

**Example Payload (Alarm):**

```json
{
  "devId": "6",
  "time": "2022-12-09 16:42:23",
  "Data": {
    "wmId": 2,
    "wmMsg": "安全门未关",
    "wmTime": "2022-12-09 16:42:22"
  }
}
```

**Example Payload (Alarm cleared):**

```json
{
  "devId": "6",
  "Data": { "wmId": 0, "wmMsg": "" }
}
```

---

## 5. Other Supported Interfaces

ELINK also provides:

* **HTTP API** for direct value readout:

  ```
  http://<ip>/v1/api/varValue?cmd=value&access_token=<token>
  ```
* **Modbus TCP** and **OPC UA** northbound protocols for SCADA or MES integration.

---

## 6. Summary of Connection Requirements

| Parameter             | Example         | Description                                 |
| --------------------- | --------------- | ------------------------------------------- |
| **Server IP**         | `3.111.222.33`  | Public or LAN broker address                |
| **Port**              | `1883`          | MQTT plaintext                              |
| **Protocol**          | MQTT 3.1/3.1.1  | No SSL/TLS support                          |
| **QoS**               | 0 or 1          | Usually 1                                   |
| **Username/Password** | Optional        | Basic auth only                             |
| **TLS/SSL**           | ❌ Not supported | Must use VPN or bridge for secure transport |

---

## 7. Recommended Secure Deployment

Since ELINK cannot do TLS or HTTPS:

* **Use a VPN or on-site MQTT bridge** to encrypt data before sending to the cloud.
* Avoid exposing the ELINK or broker ports (1883) directly to the public internet.
* If remote configuration is needed, access `http://192.168.1.233` through VPN.

---

### ✅ Quick Recap

> **ELINK → MQTT Broker connection = Plain TCP (no TLS)**
> Configure via the web UI → enter broker IP, port, device ID, and topic prefix.
> Publishes machine process, temperature, and alarm data under structured topics.
> For production use, wrap the plaintext MQTT inside a **VPN** or **TLS bridge** for secure and scalable multi-factory operation.