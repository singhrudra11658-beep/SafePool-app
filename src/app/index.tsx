import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { supabase } from "../services/supabase";

const { width } = Dimensions.get("window");

// Mapbox Public Access Token
const MAPBOX_ACCESS_TOKEN = "pk.placeholder_token";

const EMERGENCY_CONTACT_NAME = "Emergency Contact";
const EMERGENCY_CONTACT_NUMBER = "+918340344560";

interface Ride {
  id: string;
  driver_name: string;
  driver_gender: "female" | "male";
  from_location: string;
  to_location: string;
  date_time: string;
  duration: string;
  seats: number;
  price: number;
  is_women_only: boolean;
  rating: number;
  vehicle: string;
  company_tag: string;
  pickup_pin: string;
  trip_status: "available" | "booked" | "started" | "completed" | "cancelled";
}

interface UserProfile {
  phone: string;
  name: string;
  gender: "female" | "male";
  carModel: string;
}

export default function SafePoolApp() {
  const webViewRef = useRef<WebView | null>(null);

  // Mapbox Driving Route coordinates state
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);

  // Fetch real road route from Mapbox Directions API
  const fetchRouteDirections = async (pickupName: string, dropName: string) => {
    try {
      const cleanPickup = pickupName.split(",")[0].trim();
      const cleanDrop = dropName.split(",")[0].trim();

      // 1. Pickup Geocoding
      const pickupRes = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanPickup)}.json?proximity=73.8567,18.5204&access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
      );
      const pickupData = await pickupRes.json();

      // 2. Drop Geocoding
      const dropRes = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanDrop)}.json?proximity=73.8567,18.5204&access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
      );
      const dropData = await dropRes.json();

      if (pickupData.features?.length > 0 && dropData.features?.length > 0) {
        const startCoord = pickupData.features[0].center; // [lng, lat]
        const endCoord = dropData.features[0].center;

        // 3. Mapbox Directions API
        const dirRes = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`
        );
        const dirData = await dirRes.json();

        if (dirData.routes && dirData.routes.length > 0) {
          const coords = dirData.routes[0].geometry.coordinates.map((pt: [number, number]) => ({
            latitude: pt[1],
            longitude: pt[0],
          }));

          setRouteCoordinates(coords);
        }
      }
    } catch (err) {
      console.log("Mapbox Directions error:", err);
    }
  };

  // Authentication State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authPhone, setAuthPhone] = useState("");
  const [authName, setAuthName] = useState("");
  const [authGender, setAuthGender] = useState<"female" | "male">("male");
  const [authCarModel, setAuthCarModel] = useState("");
  const [isNewUserForm, setIsNewUserForm] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<"Home" | "Find" | "Offer" | "Safety" | "Profile">("Home");
  const [onlyWomenRides, setOnlyWomenRides] = useState(false);

  // Rides State
  const [rides, setRides] = useState<Ride[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);

  // Active Trip State
  const [activeBookedRide, setActiveBookedRide] = useState<Ride | null>(null);
  const [driverEnteredPin, setDriverEnteredPin] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isFareModalOpen, setIsFareModalOpen] = useState(false);
  const [completedRideSummary, setCompletedRideSummary] = useState<any>(null);

  // Fake Safety Call State
  const [isFakeCallActive, setIsFakeCallActive] = useState(false);

  // Live Location Tracker
  const [userCoord, setUserCoord] = useState({
    latitude: 18.5204,
    longitude: 73.8567,
  });

  // Autocomplete Suggestions
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [leavingDay, setLeavingDay] = useState("Today");
  const [leavingTime, setLeavingTime] = useState("");
  const [fromSuggestions, setFromSuggestions] = useState<string[]>([]);
  const [toSuggestions, setToSuggestions] = useState<string[]>([]);
  const [isSearchingFrom, setIsSearchingFrom] = useState(false);
  const [isSearchingTo, setIsSearchingTo] = useState(false);

  // Publish Form State
  const [seats, setSeats] = useState("");
  const [price, setPrice] = useState("");
  const [womenOnlyOffer, setWomenOnlyOffer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Fare Split Modal State
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitFuelCost, setSplitFuelCost] = useState("450");
  const [splitTollCost, setSplitTollCost] = useState("120");
  const [splitRidersCount, setSplitRidersCount] = useState("3");

  // Notification Banner
  const [notifBanner, setNotifBanner] = useState<string | null>(null);
  const showNotification = (msg: string) => {
    setNotifBanner(msg);
    setTimeout(() => setNotifBanner(null), 4000);
  };

  // --- PHONE AUTH HANDLERS ---
  const handleCheckPhoneOrLogin = async () => {
    if (!authPhone.trim() || authPhone.trim().length < 10) {
      Alert.alert("Invalid Phone", "Kripya 10-digit phone number daalein.");
      return;
    }

    try {
      setAuthLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("phone", authPhone.trim())
        .single();

      if (data && !error) {
        setCurrentUser({
          phone: data.phone,
          name: data.name,
          gender: data.gender,
          carModel: data.car_model || "None",
        });
        showNotification(`Welcome back, ${data.name}! 👋`);
      } else {
        setIsNewUserForm(true);
      }
    } catch {
      setIsNewUserForm(true);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterUser = async () => {
    if (!authName.trim()) {
      Alert.alert("Name Required", "Kripya apna naam daalein.");
      return;
    }

    try {
      setAuthLoading(true);
      const newUserData = {
        phone: authPhone.trim(),
        name: authName.trim(),
        gender: authGender,
        car_model: authCarModel.trim() || "No Car",
      };

      const { error } = await supabase.from("users").insert([newUserData]);
      if (error && !error.message.includes("duplicate")) {
        throw error;
      }

      setCurrentUser({
        phone: newUserData.phone,
        name: newUserData.name,
        gender: newUserData.gender,
        carModel: newUserData.car_model,
      });

      showNotification(`Account created! Welcome, ${newUserData.name} 🚀`);
    } catch (err: any) {
      Alert.alert("Auth Error", err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsNewUserForm(false);
    setAuthPhone("");
    setAuthName("");
    setAuthCarModel("");
    setActiveBookedRide(null);
    showNotification("Logged out successfully.");
  };

  // Live GPS Tracker & Auto-Center
  useEffect(() => {
    let locationSubscription: any = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location Permission",
            "Kripya Settings mein jakar Location permission allow karein."
          );
          return;
        }

        const cur = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (cur && cur.coords) {
          const newCoords = {
            latitude: cur.coords.latitude,
            longitude: cur.coords.longitude,
          };
          setUserCoord(newCoords);
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 5,
          },
          (loc) => {
            const updated = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            setUserCoord(updated);
          }
        );
      } catch (e) {
        console.log("GPS Location error:", e);
      }
    })();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // --- MAPBOX AUTOCOMPLETE (PROXIMITY AWARE) ---
  const handleLocationSearch = async (text: string, isFrom: boolean) => {
    if (isFrom) setFromLoc(text);
    else setToLoc(text);

    if (text.trim().length < 2) {
      if (isFrom) setFromSuggestions([]);
      else setToSuggestions([]);
      return;
    }

    try {
      if (isFrom) setIsSearchingFrom(true);
      else setIsSearchingTo(true);

      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        text
      )}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=in&proximity=${userCoord.longitude},${userCoord.latitude}&types=poi,address,neighborhood,locality&limit=5`;

      const res = await fetch(endpoint);
      const data = await res.json();

      if (data && data.features && data.features.length > 0) {
        const list = data.features.map((item: any) => item.place_name);
        if (isFrom) setFromSuggestions(list);
        else setToSuggestions(list);
      }
    } catch (err) {
      console.log("Mapbox search error:", err);
    } finally {
      if (isFrom) setIsSearchingFrom(false);
      else setIsSearchingTo(false);
    }
  };

  // --- FETCH RIDES ---
  const fetchRides = async () => {
    try {
      setLoadingRides(true);
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Error fetching rides:", error.message);
        return;
      }

      if (data) {
        const allRides = data as Ride[];
        setRides(allRides);

        if (currentUser) {
          const myActiveRide = allRides.find(
            (r) =>
              r.driver_name?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase() &&
              (r.trip_status === "booked" || r.trip_status === "started")
          );
          if (myActiveRide) {
            setActiveBookedRide(myActiveRide);
          }
        }
      }
    } catch (err: any) {
      console.log("Error fetching rides:", err.message);
    } finally {
      setLoadingRides(false);
    }
  };

  // Realtime Sync Listener
  useEffect(() => {
    fetchRides();

    const channel = supabase
      .channel("public:rides")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        (payload: any) => {
          fetchRides();
          const updated = payload.new as Ride;

          if (updated && currentUser) {
            const isDriver =
              updated.driver_name?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase();
            const isPassenger = activeBookedRide?.id === updated.id;

            if (isDriver || isPassenger) {
              const status = updated.trip_status as string;
              if (status === "available" || status === "cancelled" || status === "completed") {
                setActiveBookedRide(null);
              } else {
                setActiveBookedRide(updated);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.name, activeBookedRide?.id]);

  // Sync route whenever active ride changes
  useEffect(() => {
    const pickup = activeBookedRide?.from_location || (activeBookedRide as any)?.fromLoc;
    const drop = activeBookedRide?.to_location || (activeBookedRide as any)?.toLoc;

    if (pickup && drop) {
      fetchRouteDirections(pickup, drop);
    } else {
      setRouteCoordinates([]);
    }
  }, [activeBookedRide]);

  const makePhoneCall = (phoneNumber: string) => {
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url).then((s) => {
      if (s) Linking.openURL(url);
    });
  };

  const handleShareLiveLocation = async () => {
    try {
      let currentLat = userCoord.latitude;
      let currentLng = userCoord.longitude;

      try {
        const livePos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (livePos?.coords) {
          currentLat = livePos.coords.latitude;
          currentLng = livePos.coords.longitude;
          setUserCoord({ latitude: currentLat, longitude: currentLng });
        }
      } catch (locErr) {
        console.log("GPS fetch fallback:", locErr);
      }

      const pinText = activeBookedRide ? `Ride PIN: ${activeBookedRide.pickup_pin}` : "SafePool Trip";
      const mapLink = `https://maps.google.com/?q=${currentLat},${currentLng}`;
      const message = `🛡️ SafePool Commute Alert!\nI am traveling with verified pool.\nLive Tracker: ${mapLink}\n${pinText}`;

      await Share.share({ message });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleSOS = () => {
    Alert.alert(
      "🚨 EMERGENCY ALERT",
      `High-priority alert is ready. Emergency contact: ${EMERGENCY_CONTACT_NUMBER}`,
      [
        { text: "Dismiss", style: "cancel" },
        { text: "Call Contact", onPress: () => makePhoneCall(EMERGENCY_CONTACT_NUMBER) },
        { text: "Dial Police (112)", style: "destructive", onPress: () => makePhoneCall("112") },
      ]
    );
  };

  const handleCancelRide = (rideId: any) => {
    Alert.alert("Cancel Ride", "Are you sure you want to cancel this ride?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          try {
            const targetRide =
              rides.find((r) => String(r.id) === String(rideId)) || activeBookedRide;

            const isDriver =
              targetRide?.driver_name?.trim().toLowerCase() ===
              currentUser?.name?.trim().toLowerCase();

            if (isDriver) {
              const { error } = await supabase.from("rides").delete().eq("id", rideId);
              if (error) throw error;
              setRides((prev) => prev.filter((r) => String(r.id) !== String(rideId)));
            } else {
              const currentSeats = targetRide?.seats ?? 0;
              const { error } = await supabase
                .from("rides")
                .update({ seats: currentSeats + 1, trip_status: "available" })
                .eq("id", rideId);

              if (error) throw error;
            }

            if (activeBookedRide && String(activeBookedRide.id) === String(rideId)) {
              setActiveBookedRide(null);
            }

            fetchRides();
            showNotification("Ride cancelled successfully.");
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to cancel ride");
          }
        },
      },
    ]);
  };

  const handleEndTrip = async () => {
    if (!activeBookedRide) return;

    try {
      await supabase
        .from("rides")
        .update({ trip_status: "completed" })
        .eq("id", activeBookedRide.id);

      setCompletedRideSummary(activeBookedRide);
      setIsFareModalOpen(true);
      setActiveBookedRide(null);
    } catch (err: any) {
      Alert.alert("Error completing trip", err.message);
    }
  };

  const handleBookRide = async (ride: Ride) => {
    if (!currentUser) return;
    if (ride.seats <= 0) {
      Alert.alert("Ride Full", "No seats available on this ride.");
      return;
    }

    try {
      const updatedSeats = ride.seats - 1;
      await supabase
        .from("rides")
        .update({ seats: updatedSeats, trip_status: "booked" })
        .eq("id", ride.id);

      setActiveBookedRide({ ...ride, seats: updatedSeats, trip_status: "booked" });
      showNotification(`🎉 Booked with ${ride.driver_name}! PIN: ${ride.pickup_pin}`);
      Alert.alert(
        "Ride Confirmed!",
        `Driver: ${ride.driver_name}\nCar: ${ride.vehicle}\nPickup PIN: ${ride.pickup_pin}\n\nPlease share this PIN with your driver to start the trip.`,
        [{ text: "View Trip", onPress: () => setActiveTab("Home") }]
      );
    } catch (err: any) {
      Alert.alert("Booking Failed", err.message);
    }
  };

  const handleVerifyPinAndStart = async () => {
    if (!activeBookedRide) return;
    if (driverEnteredPin === activeBookedRide.pickup_pin) {
      await supabase.from("rides").update({ trip_status: "started" }).eq("id", activeBookedRide.id);
      setActiveBookedRide({ ...activeBookedRide, trip_status: "started" });
      setIsPinModalOpen(false);
      setDriverEnteredPin("");
      showNotification("✅ PIN Verified! Safe commute active.");
    } else {
      Alert.alert("Invalid PIN", "Please verify the correct 4-digit PIN with the passenger.");
    }
  };

  const handlePublish = async () => {
    if (!currentUser) return;
    if (!fromLoc || !toLoc || !seats || !price || !leavingTime) {
      Alert.alert("Incomplete Form", "Please fill in all details: Pickup, Destination, Seats, and Price.");
      return;
    }

    try {
      setPublishing(true);
      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

      const newRide = {
        driver_name: currentUser.name,
        driver_gender: currentUser.gender,
        from_location: fromLoc,
        to_location: toLoc,
        date_time: `${leavingDay}, Leaving at ${leavingTime.trim()}`,
        duration: "35 mins",
        seats: Number(seats),
        price: Number(price),
        is_women_only: womenOnlyOffer,
        rating: 5.0,
        vehicle:
          currentUser.carModel !== "None" && currentUser.carModel !== "No Car"
            ? currentUser.carModel
            : "Personal Car",
        company_tag: "Verified Commuter",
        pickup_pin: generatedPin,
        trip_status: "available",
      };

      const { error } = await supabase.from("rides").insert([newRide]);
      if (error) throw error;

      showNotification(`🚗 Ride published by ${currentUser.name}!`);
      Alert.alert("Ride Published 🚗", "Aapki ride live cloud network par add ho gayi hai!");
      setFromLoc("");
      setToLoc("");
      setSeats("");
      setPrice("");
      setFromSuggestions([]);
      setToSuggestions([]);
      fetchRides();
      setActiveTab("Find");
    } catch (err: any) {
      Alert.alert("Publish Failed", err.message);
    } finally {
      setPublishing(false);
    }
  };

  const perCommuterFare = Math.round(
    ((Number(splitFuelCost) || 0) + (Number(splitTollCost) || 0)) / (Number(splitRidersCount) || 1)
  );

  const filteredRides = rides.filter((r) => {
    const q = searchQuery.toLowerCase();
    const match =
      (r.to_location && r.to_location.toLowerCase().includes(q)) ||
      (r.from_location && r.from_location.toLowerCase().includes(q));
    if (onlyWomenRides) return match && (r.is_women_only || r.driver_gender === "female");
    return match;
  });

  // =========================================================================
  // VIEW 1: AUTH SCREEN
  // =========================================================================
  if (!currentUser) {
    return (
      <SafeAreaView style={[styles.safeContainer, { justifyContent: "center", paddingHorizontal: 24 }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F12" />

        <View style={{ alignItems: "center", marginBottom: 30 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.logoText}>SafePool</Text>
            <View style={styles.verifiedDot} />
          </View>
          <Text style={styles.subLogoText}>SECURE COMMUTE • GREEN COMMUTE</Text>
        </View>

        <View style={styles.authBoxCard}>
          <Text style={styles.authTitleText}>
            {isNewUserForm ? "Create Profile" : "Welcome to SafePool"}
          </Text>
          <Text style={styles.authSubText}>
            {isNewUserForm
              ? "Bas ye choti si details set karein"
              : "Apna mobile number daal kar continue karein"}
          </Text>

          <Text style={styles.formSectionTag}>PHONE NUMBER</Text>
          <TextInput
            style={styles.formInputField}
            placeholder="e.g. 9876543210"
            placeholderTextColor="#71717A"
            keyboardType="phone-pad"
            maxLength={10}
            value={authPhone}
            editable={!isNewUserForm}
            onChangeText={setAuthPhone}
          />

          {isNewUserForm && (
            <>
              <Text style={styles.formSectionTag}>YOUR NAME</Text>
              <TextInput
                style={styles.formInputField}
                placeholder="e.g. Rudra Singh / Suresh"
                placeholderTextColor="#71717A"
                value={authName}
                onChangeText={setAuthName}
              />

              <Text style={styles.formSectionTag}>CAR MODEL (Agar gaadi chalate hain)</Text>
              <TextInput
                style={styles.formInputField}
                placeholder="e.g. Ford Aspire / Swift / None"
                placeholderTextColor="#71717A"
                value={authCarModel}
                onChangeText={setAuthCarModel}
              />

              <Text style={styles.formSectionTag}>GENDER</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
                {(["male", "female"] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.genderSelectorBtn,
                      authGender === g && styles.genderSelectorBtnActive,
                    ]}
                    onPress={() => setAuthGender(g)}
                  >
                    <Ionicons
                      name={g === "female" ? "female" : "male"}
                      size={16}
                      color={authGender === g ? "#0B0F12" : "#A1A1AA"}
                    />
                    <Text
                      style={[
                        styles.genderSelectorBtnText,
                        authGender === g && styles.genderSelectorBtnTextActive,
                      ]}
                    >
                      {g === "female" ? "Female" : "Male"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={isNewUserForm ? handleRegisterUser : handleCheckPhoneOrLogin}
            disabled={authLoading}
          >
            {authLoading ? (
              <ActivityIndicator color="#0B0F12" />
            ) : (
              <Text style={styles.primaryActionButtonText}>
                {isNewUserForm ? "Get Started 🚀" : "Continue with Phone"}
              </Text>
            )}
          </TouchableOpacity>

          {isNewUserForm && (
            <TouchableOpacity
              style={{ marginTop: 14, alignItems: "center" }}
              onPress={() => setIsNewUserForm(false)}
            >
              <Text style={{ color: "#71717A", fontSize: 12 }}>Change Phone Number</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // =========================================================================
  // VIEW 2: LOGGED-IN MAIN APPLICATION
  // =========================================================================
  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F12" />

      {notifBanner && (
        <View style={styles.notificationBanner}>
          <Ionicons name="notifications" size={16} color="#10B981" />
          <Text style={styles.notificationBannerText} numberOfLines={2}>
            {notifBanner}
          </Text>
        </View>
      )}

      {/* HEADER */}
      <View style={styles.navHeader}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.logoText}>SafePool</Text>
            <View style={styles.verifiedDot} />
          </View>
          <Text style={styles.subLogoText}>HELLO, {currentUser.name.toUpperCase()} 👋</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            style={styles.headerToolBtn}
            onPress={() => setIsSplitModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="calculator-outline" size={16} color="#10B981" />
            <Text style={styles.headerToolBtnText}>Split</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.profileBadgeBtn, { marginLeft: 10 }]}
            onPress={() => setActiveTab("Profile")}
            activeOpacity={0.8}
          >
            <Text style={styles.profileBadgeInitial}>{currentUser.name.charAt(0)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ================= 1. EXPLORE / HOME SCREEN ================= */}
        {activeTab === "Home" && (
          <View>
            <View style={styles.mapContainer}>
              <WebView
                ref={webViewRef}
                originWhitelist={["*"]}
                style={{ width: "100%", height: 260, backgroundColor: "#0B0F12" }}
                source={{
                  html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                      <script src='https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.js'></script>
                      <link href='https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css' rel='stylesheet' />
                      <style>
                        body { margin: 0; padding: 0; background: #0B0F12; }
                        #map { position: absolute; top: 0; bottom: 0; width: 100%; height: 100%; }
                      </style>
                    </head>
                    <body>
                      <div id="map"></div>
                      <script>
                        mapboxgl.accessToken = '${MAPBOX_ACCESS_TOKEN}';
                        window.map = new mapboxgl.Map({
                          container: 'map',
                          style: 'mapbox://styles/mapbox/dark-v11',
                          center: [${userCoord.longitude}, ${userCoord.latitude}],
                          zoom: 12
                        });

                        new mapboxgl.Marker({ color: '#10B981' })
                          .setLngLat([${userCoord.longitude}, ${userCoord.latitude}])
                          .addTo(window.map);

                        const pickup = "${activeBookedRide?.from_location || (activeBookedRide as any)?.fromLoc || ""}";
                        const drop = "${activeBookedRide?.to_location || (activeBookedRide as any)?.toLoc || ""}";

                        if (pickup && drop) {
                          Promise.all([
                            fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(pickup.split(',')[0]) + '.json?proximity=73.8567,18.5204&access_token=' + mapboxgl.accessToken + '&limit=1').then(r => r.json()),
                            fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(drop.split(',')[0]) + '.json?proximity=73.8567,18.5204&access_token=' + mapboxgl.accessToken + '&limit=1').then(r => r.json())
                          ]).then(([pData, dData]) => {
                            if (pData.features?.length && dData.features?.length) {
                              const pCoord = pData.features[0].center;
                              const dCoord = dData.features[0].center;

                              new mapboxgl.Marker({ color: '#10B981' }).setLngLat(pCoord).addTo(window.map);
                              new mapboxgl.Marker({ color: '#EF4444' }).setLngLat(dCoord).addTo(window.map);

                              fetch('https://api.mapbox.com/directions/v5/mapbox/driving/' + pCoord[0] + ',' + pCoord[1] + ';' + dCoord[0] + ',' + dCoord[1] + '?geometries=geojson&overview=full&access_token=' + mapboxgl.accessToken)
                                .then(r => r.json())
                                .then(data => {
                                  if (data.routes?.length) {
                                    window.map.addSource('route', {
                                      type: 'geojson',
                                      data: {
                                        type: 'Feature',
                                        geometry: data.routes[0].geometry
                                      }
                                    });
                                    window.map.addLayer({
                                      id: 'route',
                                      type: 'line',
                                      source: 'route',
                                      layout: { 'line-join': 'round', 'line-cap': 'round' },
                                      paint: { 'line-color': '#10B981', 'line-width': 5 }
                                    });

                                    const bounds = new mapboxgl.LngLatBounds();
                                    data.routes[0].geometry.coordinates.forEach(c => bounds.extend(c));
                                    window.map.fitBounds(bounds, { padding: 40 });
                                  }
                                });
                            }
                          });
                        }
                      </script>
                    </body>
                    </html>
                  `,
                }}
              />

              {/* Recenter Button using Mapbox WebView Injection */}
              <TouchableOpacity
                style={styles.recenterFloatingBtn}
                onPress={() => {
                  webViewRef.current?.injectJavaScript(`
                    if (window.map) {
                      window.map.flyTo({ center: [${userCoord.longitude}, ${userCoord.latitude}], zoom: 14 });
                    }
                    true;
                  `);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="locate" size={20} color="#10B981" />
              </TouchableOpacity>

              {/* Share Trip Live Button */}
              <TouchableOpacity
                style={styles.mapShareFloatingBtn}
                onPress={handleShareLiveLocation}
                activeOpacity={0.85}
              >
                <Ionicons name="share-social" size={16} color="#0B0F12" />
                <Text style={styles.mapShareFloatingBtnText}>Share Trip Live</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tabContentWrapper}>
              {activeBookedRide ? (
                <View style={styles.activeTripCard}>
                  <View style={styles.activeTripHeader}>
                    <View>
                      <Text style={styles.activeTripBadge}>
                        {activeBookedRide.trip_status === "started"
                          ? "🟢 TRIP ONGOING"
                          : "🟡 READY FOR BOARDING"}
                      </Text>
                      <Text style={styles.activeTripDriver}>
                        {activeBookedRide.driver_name} • {activeBookedRide.vehicle}
                      </Text>
                    </View>
                    {currentUser?.name !== activeBookedRide?.driver_name &&
                      activeBookedRide.trip_status !== "started" && (
                        <View style={styles.pinBox}>
                          <Text style={styles.pinMiniLabel}>PICKUP PIN</Text>
                          <Text style={styles.pinDigit}>{activeBookedRide.pickup_pin}</Text>
                        </View>
                      )}
                  </View>

                  <Text style={styles.activeTripRoute}>
                    {activeBookedRide.from_location} ➔ {activeBookedRide.to_location}
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    {activeBookedRide.trip_status === "started" ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          backgroundColor: "#EF4444",
                          paddingVertical: 10,
                          borderRadius: 8,
                          alignItems: "center",
                        }}
                        onPress={handleEndTrip}
                      >
                        <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>🏁 End Trip</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            backgroundColor: "#1F2937",
                            borderWidth: 1,
                            borderColor: "#EF4444",
                            paddingVertical: 10,
                            borderRadius: 8,
                            alignItems: "center",
                          }}
                          onPress={() => handleCancelRide(activeBookedRide.id)}
                        >
                          <Text style={{ color: "#EF4444", fontWeight: "700" }}>Cancel Ride</Text>
                        </TouchableOpacity>

                        {currentUser?.name === activeBookedRide?.driver_name && (
                          <TouchableOpacity
                            style={{
                              flex: 1,
                              backgroundColor: "#10B981",
                              paddingVertical: 10,
                              borderRadius: 8,
                              alignItems: "center",
                            }}
                            onPress={() => setIsPinModalOpen(true)}
                          >
                            <Text style={{ color: "#064E3B", fontWeight: "800" }}>🔑 Enter PIN</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.pinVisualCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pinLabel}>SAFETY PIN SYSTEM</Text>
                    <Text style={styles.pinDesc}>Auto-generates upon booking a pool</Text>
                  </View>
                  <View style={styles.pinBoxInactive}>
                    <Text style={styles.pinDigitInactive}>••••</Text>
                  </View>
                </View>
              )}

              {currentUser.gender === "female" && (
                <View style={styles.womenModeContainer}>
                  <View style={styles.womenModeIconBox}>
                    <Ionicons name="female" size={20} color="#F43F5E" />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 12 }}>
                    <Text style={styles.womenModeHeading}>Women-Only Corridor</Text>
                    <Text style={styles.womenModeDesc}>Filter rides with female commuters</Text>
                  </View>
                  <Switch
                    value={onlyWomenRides}
                    onValueChange={setOnlyWomenRides}
                    trackColor={{ false: "#27272A", true: "#F43F5E" }}
                    thumbColor={onlyWomenRides ? "#FFFFFF" : "#71717A"}
                  />
                </View>
              )}

              <View style={styles.quickActionGrid}>
                <TouchableOpacity
                  style={styles.gridActionItem}
                  onPress={() => setIsSplitModalOpen(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.gridIconBackdrop}>
                    <Ionicons name="calculator" size={22} color="#10B981" />
                  </View>
                  <Text style={styles.gridItemLabel}>Split Fare</Text>
                  <Text style={styles.gridItemSub}>Fuel & Toll</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gridActionItem}
                  onPress={() => setIsFakeCallActive(true)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.gridIconBackdrop, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                    <Ionicons name="call-outline" size={22} color="#F59E0B" />
                  </View>
                  <Text style={styles.gridItemLabel}>Fake Call</Text>
                  <Text style={styles.gridItemSub}>Discreet Exit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gridActionItem}
                  onPress={() => setActiveTab("Safety")}
                  activeOpacity={0.8}
                >
                  <View style={[styles.gridIconBackdrop, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                    <Ionicons name="shield-checkmark" size={22} color="#EF4444" />
                  </View>
                  <Text style={styles.gridItemLabel}>SOS Center</Text>
                  <Text style={styles.gridItemSub}>Emergency</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ================= 2. FIND RIDES (WITH CANCEL BUTTON) ================= */}
        {activeTab === "Find" && (
          <View style={styles.tabContentWrapper}>
            <View style={styles.searchBarContainer}>
              <Ionicons name="search-outline" size={18} color="#10B981" />
              <TextInput
                style={styles.searchTextInput}
                placeholder="Search destination, sector, or driver..."
                placeholderTextColor="#71717A"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <View style={styles.rideCountRow}>
              <Text style={styles.rideCountText}>AVAILABLE RIDES IN CLOUD</Text>
              <Text style={styles.rideCountValue}>{filteredRides.length} active routes</Text>
            </View>

            {loadingRides ? (
              <ActivityIndicator size="large" color="#10B981" style={{ marginVertical: 30 }} />
            ) : filteredRides.length === 0 ? (
              <View style={styles.emptyCloudBox}>
                <Ionicons name="car-outline" size={36} color="#71717A" />
                <Text style={styles.emptyCloudTitle}>No Rides Available</Text>
                <Text style={styles.emptyCloudSub}>Publish tab se ride add karein!</Text>
              </View>
            ) : (
              filteredRides.map((ride) => (
                <View key={ride.id} style={styles.uberStyleRideCard}>
                  <View style={styles.cardDriverHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={styles.driverAvatarPill}>
                        <Text style={styles.driverAvatarInitial}>
                          {ride.driver_name ? ride.driver_name.charAt(0) : "D"}
                        </Text>
                      </View>
                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.driverCardName}>{ride.driver_name}</Text>
                        <Text style={styles.driverCompanyTag}>
                          {ride.vehicle} • ⭐ {ride.rating || 5.0}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.rideCardFare}>₹{ride.price}</Text>
                      <Text style={styles.perSeatText}>per seat</Text>
                    </View>
                  </View>

                  <View style={styles.routeVisualizerBlock}>
                    <View style={styles.routeStepRow}>
                      <View style={[styles.stepIndicator, { borderColor: "#10B981" }]} />
                      <Text style={styles.stepLocationText} numberOfLines={1}>
                        {ride.from_location}
                      </Text>
                    </View>
                    <View style={styles.stepDottedLine} />
                    <View style={styles.routeStepRow}>
                      <View style={[styles.stepIndicator, { borderColor: "#EF4444" }]} />
                      <Text style={styles.stepLocationText} numberOfLines={1}>
                        {ride.to_location}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardBottomRow}>
                    <Text style={styles.vehicleInfoText}>{ride.date_time}</Text>

                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {ride.driver_name === currentUser.name ? (
                        <TouchableOpacity
                          style={[styles.bookActionBtn, { backgroundColor: "#EF4444" }]}
                          onPress={() => handleCancelRide(ride.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.bookActionBtnText, { color: "#FFFFFF" }]}>
                            Cancel Ride
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.bookActionBtn,
                            ride.seats <= 0 && { backgroundColor: "#27272A" },
                          ]}
                          onPress={() => handleBookRide(ride)}
                          disabled={ride.seats <= 0}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.bookActionBtnText,
                              ride.seats <= 0 && { color: "#71717A" },
                            ]}
                          >
                            {ride.seats <= 0 ? "Full" : `Book Seat (${ride.seats} left)`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ================= 3. PUBLISH RIDE (MAPBOX SEARCH) ================= */}
        {activeTab === "Offer" && (
          <View style={styles.tabContentWrapper}>
            <Text style={styles.formPageTitle}>Publish a Ride</Text>
            <Text style={styles.formPageDesc}>
              Publishing as{" "}
              <Text style={{ color: "#10B981", fontWeight: "800" }}>{currentUser.name}</Text> ({currentUser.carModel})
            </Text>

            <View style={styles.publishFormWrapper}>
              <Text style={styles.formSectionTag}>PICKUP LOCATION</Text>
              <TextInput
                style={styles.formInputField}
                placeholder="Type location (e.g. Bharati Vidyapeeth, Katraj)"
                placeholderTextColor="#71717A"
                value={fromLoc}
                onChangeText={(t) => handleLocationSearch(t, true)}
              />

              {isSearchingFrom && <ActivityIndicator size="small" color="#10B981" />}

              {fromSuggestions.length > 0 && (
                <View style={styles.autoSuggestBox}>
                  {fromSuggestions.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.autoSuggestItem}
                      onPress={() => {
                        setFromLoc(item);
                        setFromSuggestions([]);
                      }}
                    >
                      <Ionicons name="location-outline" size={14} color="#10B981" style={{ marginRight: 8 }} />
                      <Text style={styles.autoSuggestText} numberOfLines={1}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.formSectionTag}>DESTINATION LOCATION</Text>
              <TextInput
                style={styles.formInputField}
                placeholder="Type destination (e.g. Hinjewadi Phase 1, Pune)"
                placeholderTextColor="#71717A"
                value={toLoc}
                onChangeText={(t) => handleLocationSearch(t, false)}
              />

              {isSearchingTo && <ActivityIndicator size="small" color="#10B981" />}

              {toSuggestions.length > 0 && (
                <View style={styles.autoSuggestBox}>
                  {toSuggestions.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.autoSuggestItem}
                      onPress={() => {
                        setToLoc(item);
                        setToSuggestions([]);
                      }}
                    >
                      <Ionicons name="location-outline" size={14} color="#EF4444" style={{ marginRight: 8 }} />
                      <Text style={styles.autoSuggestText} numberOfLines={1}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* DEPARTURE SCHEDULE */}
              <Text style={[styles.formSectionTag, { marginTop: 14 }]}>DEPARTURE SCHEDULE</Text>

              {/* Quick Day Selector Pills */}
              <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
                {["Today", "Tomorrow", "Daily (Mon-Fri)"].map((day) => (
                  <TouchableOpacity
                    key={day}
                    onPress={() => setLeavingDay(day)}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      backgroundColor: leavingDay === day ? "#10B981" : "#262626",
                      borderWidth: 1,
                      borderColor: leavingDay === day ? "#10B981" : "#404040",
                    }}
                  >
                    <Text
                      style={{
                        color: leavingDay === day ? "#FFFFFF" : "#A3A3A3",
                        fontWeight: "600",
                        fontSize: 13,
                      }}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Time Input */}
              <TextInput
                style={styles.formInputField}
                placeholder="Departure Time (e.g. 05:30 PM)"
                placeholderTextColor="#71717A"
                value={leavingTime}
                onChangeText={setLeavingTime}
              />

              <View style={styles.formDualRow}>
                <View style={{ width: "48%" }}>
                  <Text style={styles.formSectionTag}>SEATS</Text>
                  <TextInput
                    style={styles.formInputField}
                    placeholder="e.g. 3"
                    placeholderTextColor="#71717A"
                    keyboardType="numeric"
                    value={seats}
                    onChangeText={setSeats}
                  />
                </View>
                <View style={{ width: "48%" }}>
                  <Text style={styles.formSectionTag}>PRICE (₹)</Text>
                  <TextInput
                    style={styles.formInputField}
                    placeholder="e.g. 150"
                    placeholderTextColor="#71717A"
                    keyboardType="numeric"
                    value={price}
                    onChangeText={setPrice}
                  />
                </View>
              </View>

              {currentUser.gender === "female" && (
                <TouchableOpacity
                  style={[styles.womenRestrictedToggle, womenOnlyOffer && styles.womenRestrictedToggleActive]}
                  onPress={() => setWomenOnlyOffer(!womenOnlyOffer)}
                >
                  <Ionicons
                    name={womenOnlyOffer ? "checkbox" : "square-outline"}
                    size={22}
                    color={womenOnlyOffer ? "#F43F5E" : "#71717A"}
                  />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.wrtHeading}>Restrict to Women Only</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.publishSubmitBtn}
                onPress={handlePublish}
                disabled={publishing}
              >
                {publishing ? (
                  <ActivityIndicator color="#0B0F12" />
                ) : (
                  <Text style={styles.publishSubmitBtnText}>Publish to Cloud</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================= 4. ORIGINAL FULL SAFETY SOS SCREEN ================= */}
        {activeTab === "Safety" && (
          <View style={styles.tabContentWrapper}>
            <TouchableOpacity
              style={styles.sosSuperCard}
              onPress={handleSOS}
              activeOpacity={0.85}
            >
              <View style={styles.sosRingsOuter}>
                <Ionicons name="call" size={34} color="#EF4444" />
              </View>
              <Text style={styles.sosCardTitle}>EMERGENCY SOS</Text>
              <Text style={styles.sosCardSub}>
                Instant dialer connection & live coordinate broadcast
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fakeCallBanner}
              onPress={() => setIsFakeCallActive(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={20} color="#F59E0B" />
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={styles.fcbTitle}>Simulate Fake Safety Call</Text>
                <Text style={styles.fcbSub}>Rings an emergency excuse call to exit uncomfortable rides</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#71717A" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareSosBanner}
              onPress={handleShareLiveLocation}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social-outline" size={20} color="#10B981" />
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={styles.ssbTitle}>Broadcast Trip to Family</Text>
                <Text style={styles.ssbSub}>Sends live GPS tracker link via WhatsApp / SMS</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#71717A" />
            </TouchableOpacity>

            <Text style={styles.sectionTitleText}>Immediate Response</Text>
            <View style={styles.helplineButtonGroup}>
              <TouchableOpacity
                style={[styles.helplineBtn, { backgroundColor: "#EF4444" }]}
                onPress={() => makePhoneCall("112")}
                activeOpacity={0.8}
              >
                <Ionicons name="shield" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.helplineBtnText}>Police (112)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.helplineBtn, { backgroundColor: "#BE185D" }]}
                onPress={() => makePhoneCall("1091")}
                activeOpacity={0.8}
              >
                <Ionicons name="female" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.helplineBtnText}>Women Line (1091)</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactDialCard}>
              <View style={styles.contactAvatar}>
                <Ionicons name="call-sharp" size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={styles.contactCardName}>{EMERGENCY_CONTACT_NAME}</Text>
                <Text style={styles.contactCardNumber}>{EMERGENCY_CONTACT_NUMBER} (Primary SOS)</Text>
              </View>
              <TouchableOpacity
                style={styles.contactCallBtn}
                onPress={() => makePhoneCall(EMERGENCY_CONTACT_NUMBER)}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={18} color="#0B0F12" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================= 5. PROFILE SCREEN ================= */}
        {activeTab === "Profile" && (
          <View style={styles.tabContentWrapper}>
            <View style={styles.profileMetaHeader}>
              <View style={styles.profileBigAvatar}>
                <Text style={styles.profileBigAvatarText}>{currentUser.name.charAt(0)}</Text>
              </View>
              <Text style={styles.profileUserName}>{currentUser.name}</Text>
              <Text style={styles.profileTagline}>📞 {currentUser.phone}</Text>
              <Text style={{ color: "#10B981", fontSize: 12, marginTop: 4, fontWeight: "700" }}>
                🚗 {currentUser.carModel} • {currentUser.gender.toUpperCase()}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#064E3B",
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 20,
                alignSelf: "center",
                marginTop: 14,
                borderWidth: 1,
                borderColor: "#10B981",
                gap: 6,
              }}
            >
              <Ionicons name="shield-checkmark" size={15} color="#10B981" />
              <Text style={{ color: "#A7F3D0", fontSize: 12, fontWeight: "700" }}>
                Verified Member • {(currentUser as any)?.college || "Campus Verified"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-around",
                backgroundColor: "#111827",
                paddingVertical: 14,
                borderRadius: 16,
                marginTop: 14,
                marginHorizontal: 4,
                borderWidth: 1,
                borderColor: "#1F2937",
              }}
            >
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: "#F9FAFB", fontSize: 17, fontWeight: "800" }}>
                  {(currentUser as any)?.totalRides || rides.length || 0}
                </Text>
                <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>Rides Taken</Text>
              </View>

              <View style={{ width: 1, height: "70%", backgroundColor: "#374151", alignSelf: "center" }} />

              <View style={{ alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="star" size={15} color="#FBBF24" />
                  <Text style={{ color: "#F9FAFB", fontSize: 17, fontWeight: "800" }}>
                    {(currentUser as any)?.rating || "5.0"}
                  </Text>
                </View>
                <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>Rating</Text>
              </View>

              <View style={{ width: 1, height: "70%", backgroundColor: "#374151", alignSelf: "center" }} />

              <View style={{ alignItems: "center" }}>
                <Text style={{ color: "#10B981", fontSize: 17, fontWeight: "800" }}>
                  {((currentUser as any)?.totalRides || rides.length || 1) * 2} kg
                </Text>
                <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>CO₂ Saved</Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: "#111827",
                padding: 14,
                borderRadius: 16,
                marginTop: 12,
                marginHorizontal: 4,
                borderWidth: 1,
                borderColor: "#1F2937",
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="car-sport" size={18} color="#10B981" />
                  <Text style={{ color: "#F9FAFB", fontSize: 14, fontWeight: "700" }}>Vehicle Registered</Text>
                </View>
                <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "600" }}>Verified</Text>
              </View>
              <View style={{ marginTop: 8, gap: 2 }}>
                <Text style={{ color: "#E5E7EB", fontSize: 13, fontWeight: "600" }}>
                  {currentUser?.carModel || "No Vehicle Registered"}
                </Text>
                <Text style={{ color: "#9CA3AF", fontSize: 11 }}>
                  {(currentUser as any)?.vehicleNo || "Campus Commuter"} • Available for Pooling
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 14, marginHorizontal: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ color: "#F9FAFB", fontSize: 14, fontWeight: "700" }}>Recent Ride History</Text>
                <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "600" }}>
                  {rides.length} Total
                </Text>
              </View>

              {rides.length === 0 ? (
                <Text style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", marginVertical: 10 }}>
                  No completed rides yet.
                </Text>
              ) : (
                rides.slice(0, 3).map((r: any, idx: number) => (
                  <View
                    key={r.id || idx}
                    style={{
                      backgroundColor: "#111827",
                      padding: 12,
                      borderRadius: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: "#1F2937",
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: "#9CA3AF", fontSize: 11 }}>{r.date || "Today"}</Text>
                      <Text
                        style={{
                          color: "#10B981",
                          fontSize: 10,
                          fontWeight: "700",
                          backgroundColor: "#064E3B",
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                        }}
                      >
                        {r.status || "ACTIVE"}
                      </Text>
                    </View>
                    <Text style={{ color: "#F3F4F6", fontSize: 13, fontWeight: "600", marginTop: 4 }}>
                      {(r.from_location || r.fromLoc || "Pickup").split(",")[0]} ➔{" "}
                      {(r.to_location || r.toLoc || "Drop").split(",")[0]}
                    </Text>
                    <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 1 }}>
                      Driver: {r.driver_name || "Verified Driver"} • ₹{r.price || "50"}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity
              style={[styles.settingItem, { marginTop: 14, borderColor: "#EF4444" }]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={[styles.settingItemLabel, { color: "#EF4444" }]}>Log Out ({currentUser.name})</Text>
              <Ionicons name="chevron-forward" size={18} color="#71717A" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* TRIP COMPLETED & FARE SUMMARY MODAL */}
      <Modal visible={isFareModalOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              width: "100%",
              borderRadius: 20,
              padding: 24,
              borderWidth: 1,
              borderColor: "#10B981",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "#064E3B",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <Ionicons name="checkmark-circle" size={38} color="#10B981" />
            </View>

            <Text style={{ color: "#F9FAFB", fontSize: 20, fontWeight: "800" }}>Ride Completed!</Text>
            <Text style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4, textAlign: "center" }}>
              Hope you had a safe and smooth commute!
            </Text>

            <View
              style={{
                backgroundColor: "#1F2937",
                width: "100%",
                borderRadius: 14,
                padding: 16,
                alignItems: "center",
                marginVertical: 18,
                borderWidth: 1,
                borderColor: "#374151",
              }}
            >
              <Text style={{ color: "#9CA3AF", fontSize: 13 }}>Total Fare to Pay / Collect</Text>
              <Text style={{ color: "#10B981", fontSize: 32, fontWeight: "900", marginTop: 4 }}>
                ₹{completedRideSummary?.price || "50"}
              </Text>
              <Text style={{ color: "#6EE7B7", fontSize: 11, marginTop: 4 }}>
                Payment Mode: Cash or Direct UPI
              </Text>
            </View>

            <View style={{ width: "100%", marginBottom: 18 }}>
              <Text style={{ color: "#D1D5DB", fontSize: 13, fontWeight: "600" }}>
                Driver: {completedRideSummary?.driver_name || "Verified Driver"}
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                Vehicle: {completedRideSummary?.vehicle || "Ford Aspire"}
              </Text>
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: "#10B981",
                width: "100%",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
              onPress={() => {
                setIsFareModalOpen(false);
                setCompletedRideSummary(null);
              }}
            >
              <Text style={{ color: "#111827", fontSize: 15, fontWeight: "800" }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 1: FARE SPLITTER */}
      <Modal visible={isSplitModalOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <Text style={styles.modalTitle}>Fair Commute Splitter</Text>
              <TouchableOpacity onPress={() => setIsSplitModalOpen(false)}>
                <Ionicons name="close-circle" size={24} color="#71717A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.editInputLabel}>ESTIMATED FUEL (₹)</Text>
            <TextInput
              style={styles.editInputField}
              keyboardType="numeric"
              value={splitFuelCost}
              onChangeText={setSplitFuelCost}
            />

            <Text style={styles.editInputLabel}>TOLL CHARGES (₹)</Text>
            <TextInput
              style={styles.editInputField}
              keyboardType="numeric"
              value={splitTollCost}
              onChangeText={setSplitTollCost}
            />

            <Text style={styles.editInputLabel}>RIDERS COUNT</Text>
            <TextInput
              style={styles.editInputField}
              keyboardType="numeric"
              value={splitRidersCount}
              onChangeText={setSplitRidersCount}
            />

            <View style={styles.fareResultDisplayBox}>
              <Text style={styles.fareResultDisplayLabel}>EACH RIDER PAYS</Text>
              <Text style={styles.fareResultDisplayVal}>₹{perCommuterFare}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: PIN MODAL */}
      <Modal visible={isPinModalOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter Passenger PIN</Text>
            <TextInput
              style={styles.pinInputModal}
              placeholder="e.g. 4829"
              placeholderTextColor="#71717A"
              keyboardType="numeric"
              maxLength={4}
              value={driverEnteredPin}
              onChangeText={setDriverEnteredPin}
            />
            <TouchableOpacity style={styles.modalVerifyBtn} onPress={handleVerifyPinAndStart}>
              <Text style={styles.modalVerifyBtnText}>Verify & Start Trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: FAKE CALL */}
      <Modal visible={isFakeCallActive} transparent animationType="fade">
        <View style={styles.fakeCallScreen}>
          <View style={styles.fakeCallTop}>
            <Text style={styles.fakeCallIncomingText}>INCOMING CALL</Text>
            <Text style={styles.fakeCallCallerName}>Family Emergency</Text>
          </View>
          <View style={styles.fakeCallAvatarBox}>
            <Ionicons name="person" size={60} color="#71717A" />
          </View>
          <TouchableOpacity
            style={[styles.fakeCallBtn, { backgroundColor: "#EF4444" }]}
            onPress={() => setIsFakeCallActive(false)}
          >
            <Ionicons name="call" size={28} color="#FFFFFF" style={{ transform: [{ rotate: "135deg" }] }} />
            <Text style={styles.fakeCallBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* BOTTOM NAVIGATION */}
      <View style={styles.bottomDockBar}>
        <TouchableOpacity style={styles.dockTabItem} onPress={() => setActiveTab("Home")}>
          <Ionicons
            name={activeTab === "Home" ? "map" : "map-outline"}
            size={22}
            color={activeTab === "Home" ? "#10B981" : "#71717A"}
          />
          <Text style={[styles.dockTabLabel, activeTab === "Home" && styles.dockTabLabelActive]}>
            Explore
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dockTabItem} onPress={() => setActiveTab("Find")}>
          <Ionicons
            name={activeTab === "Find" ? "search" : "search-outline"}
            size={22}
            color={activeTab === "Find" ? "#10B981" : "#71717A"}
          />
          <Text style={[styles.dockTabLabel, activeTab === "Find" && styles.dockTabLabelActive]}>
            Rides
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dockTabItem} onPress={() => setActiveTab("Offer")}>
          <Ionicons
            name={activeTab === "Offer" ? "add-circle" : "add-circle-outline"}
            size={24}
            color={activeTab === "Offer" ? "#10B981" : "#71717A"}
          />
          <Text style={[styles.dockTabLabel, activeTab === "Offer" && styles.dockTabLabelActive]}>
            Publish
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dockTabItem} onPress={() => setActiveTab("Safety")}>
          <Ionicons
            name={activeTab === "Safety" ? "shield" : "shield-outline"}
            size={22}
            color={activeTab === "Safety" ? "#EF4444" : "#71717A"}
          />
          <Text style={[styles.dockTabLabel, activeTab === "Safety" && { color: "#EF4444" }]}>
            SOS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dockTabItem} onPress={() => setActiveTab("Profile")}>
          <Ionicons
            name={activeTab === "Profile" ? "person" : "person-outline"}
            size={22}
            color={activeTab === "Profile" ? "#10B981" : "#71717A"}
          />
          <Text style={[styles.dockTabLabel, activeTab === "Profile" && styles.dockTabLabelActive]}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: "#0B0F12" },
  authBoxCard: {
    backgroundColor: "#131920",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#1E2630",
  },
  authTitleText: { fontSize: 20, fontWeight: "900", color: "#FFFFFF" },
  authSubText: { fontSize: 13, color: "#71717A", marginTop: 4, marginBottom: 18 },
  notificationBanner: {
    backgroundColor: "#131920",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
  },
  notificationBannerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700", marginLeft: 8, flex: 1 },
  navHeader: {
    backgroundColor: "#131920",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1E2630",
  },
  logoText: { fontSize: 24, fontWeight: "900", color: "#FFFFFF", letterSpacing: -0.6 },
  verifiedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981", marginLeft: 4, marginTop: 4 },
  subLogoText: { fontSize: 9, fontWeight: "800", color: "#10B981", letterSpacing: 0.8, marginTop: 2 },
  headerToolBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  headerToolBtnText: { fontSize: 11, fontWeight: "800", color: "#10B981", marginLeft: 4 },
  profileBadgeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#10B981",
  },
  profileBadgeInitial: { fontSize: 16, fontWeight: "800", color: "#10B981" },
  mainScrollView: { flex: 1 },
  mapContainer: { width: width, height: 260, position: "relative" },
  recenterFloatingBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "#131920",
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#10B981",
    elevation: 5,
  },
  mapShareFloatingBtn: {
    position: "absolute",
    bottom: 12,
    right: 14,
    backgroundColor: "#10B981",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  mapShareFloatingBtnText: { color: "#0B0F12", fontSize: 12, fontWeight: "800", marginLeft: 6 },
  tabContentWrapper: { paddingHorizontal: 18, paddingTop: 16 },
  activeTripCard: {
    backgroundColor: "#131920",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#10B981",
  },
  activeTripHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  activeTripBadge: { fontSize: 11, fontWeight: "900", color: "#10B981", letterSpacing: 0.5 },
  activeTripDriver: { fontSize: 14, fontWeight: "700", color: "#FFFFFF", marginTop: 2 },
  activeTripRoute: { fontSize: 12, color: "#A1A1AA", marginTop: 8 },
  pinVisualCard: {
    backgroundColor: "#131920",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1E2630",
  },
  pinLabel: { fontSize: 11, fontWeight: "800", color: "#71717A", letterSpacing: 0.5 },
  pinDesc: { fontSize: 11, color: "#52525B", marginTop: 2 },
  pinBox: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#10B981",
    alignItems: "center",
  },
  pinMiniLabel: { fontSize: 8, fontWeight: "800", color: "#10B981" },
  pinDigit: { fontSize: 18, fontWeight: "900", color: "#10B981", letterSpacing: 2 },
  pinBoxInactive: {
    backgroundColor: "#1E2630",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pinDigitInactive: { fontSize: 16, fontWeight: "900", color: "#52525B", letterSpacing: 3 },
  womenModeContainer: {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.25)",
  },
  womenModeIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(244, 63, 94, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  womenModeHeading: { fontSize: 14, fontWeight: "800", color: "#FDA4AF" },
  womenModeDesc: { fontSize: 11, color: "#FB7185", marginTop: 2 },
  primaryActionButton: {
    backgroundColor: "#10B981",
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  primaryActionButtonText: { color: "#0B0F12", fontSize: 14, fontWeight: "800" },
  quickActionGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  gridActionItem: {
    width: "31%",
    backgroundColor: "#131920",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2630",
  },
  gridIconBackdrop: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  gridItemLabel: { fontSize: 12, fontWeight: "800", color: "#FFFFFF" },
  gridItemSub: { fontSize: 10, color: "#71717A", marginTop: 2 },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131920",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 12,
  },
  searchTextInput: { flex: 1, marginLeft: 10, fontSize: 14, color: "#FFFFFF", fontWeight: "600" },
  rideCountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  rideCountText: { fontSize: 10, fontWeight: "800", color: "#71717A", letterSpacing: 0.5 },
  rideCountValue: { fontSize: 12, fontWeight: "700", color: "#10B981" },
  emptyCloudBox: {
    backgroundColor: "#131920",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2630",
    marginVertical: 20,
  },
  emptyCloudTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", marginTop: 10 },
  emptyCloudSub: { fontSize: 12, color: "#71717A", textAlign: "center", marginTop: 4 },
  uberStyleRideCard: {
    backgroundColor: "#131920",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1E2630",
  },
  cardDriverHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  driverAvatarPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  driverAvatarInitial: { fontSize: 16, fontWeight: "800", color: "#10B981" },
  driverCardName: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  driverCompanyTag: { fontSize: 11, color: "#10B981", marginTop: 2, fontWeight: "600" },
  rideCardFare: { fontSize: 19, fontWeight: "900", color: "#FFFFFF" },
  perSeatText: { fontSize: 10, color: "#71717A" },
  routeVisualizerBlock: { marginVertical: 14, paddingLeft: 4 },
  routeStepRow: { flexDirection: "row", alignItems: "center" },
  stepIndicator: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, backgroundColor: "#131920" },
  stepLocationText: { marginLeft: 12, fontSize: 13, fontWeight: "600", color: "#E4E4E7", flex: 1 },
  stepDottedLine: { width: 2, height: 16, backgroundColor: "#27272A", marginLeft: 4, marginVertical: 3 },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E2630",
  },
  vehicleInfoText: { fontSize: 11, color: "#A1A1AA", fontWeight: "600" },
  bookActionBtn: { backgroundColor: "#10B981", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  bookActionBtnText: { color: "#0B0F12", fontSize: 12, fontWeight: "800" },
  formPageTitle: { fontSize: 22, fontWeight: "900", color: "#FFFFFF" },
  formPageDesc: { fontSize: 13, color: "#71717A", marginTop: 4, marginBottom: 16 },
  publishFormWrapper: { backgroundColor: "#131920", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#1E2630" },
  formSectionTag: { fontSize: 10, fontWeight: "800", color: "#10B981", letterSpacing: 0.5, marginBottom: 6 },
  formInputField: {
    backgroundColor: "#0B0F12",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 8,
    fontWeight: "600",
  },
  autoSuggestBox: {
    backgroundColor: "#0F141C",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 12,
  },
  autoSuggestItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A222B",
  },
  autoSuggestText: { color: "#E4E4E7", fontSize: 12, fontWeight: "600", flex: 1 },
  formDualRow: { flexDirection: "row", justifyContent: "space-between" },
  womenRestrictedToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B0F12",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 16,
  },
  womenRestrictedToggleActive: { backgroundColor: "rgba(244, 63, 94, 0.1)", borderColor: "#F43F5E" },
  wrtHeading: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  publishSubmitBtn: { backgroundColor: "#10B981", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  publishSubmitBtnText: { color: "#0B0F12", fontSize: 14, fontWeight: "800" },
  sosSuperCard: { backgroundColor: "#EF4444", borderRadius: 22, padding: 24, alignItems: "center", marginBottom: 14 },
  sosRingsOuter: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  sosCardTitle: { fontSize: 20, fontWeight: "900", color: "#FFFFFF" },
  sosCardSub: { fontSize: 12, color: "#FEE2E2", textAlign: "center", marginTop: 6 },
  fakeCallBanner: {
    backgroundColor: "#131920",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  fcbTitle: { fontSize: 13, fontWeight: "800", color: "#F59E0B" },
  fcbSub: { fontSize: 11, color: "#71717A", marginTop: 2 },
  shareSosBanner: {
    backgroundColor: "#131920",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  ssbTitle: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  ssbSub: { fontSize: 11, color: "#71717A", marginTop: 2 },
  sectionTitleText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", marginBottom: 10, marginTop: 10 },
  helplineButtonGroup: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  helplineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "48%",
    paddingVertical: 14,
    borderRadius: 14,
  },
  helplineBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  contactDialCard: {
    backgroundColor: "#131920",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1E2630",
  },
  contactAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  contactCardName: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  contactCardNumber: { fontSize: 12, color: "#71717A", marginTop: 2 },
  contactCallBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center" },
  profileMetaHeader: {
    backgroundColor: "#131920",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 16,
  },
  profileBigAvatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#10B981",
  },
  profileBigAvatarText: { fontSize: 26, fontWeight: "900", color: "#10B981" },
  profileUserName: { fontSize: 18, fontWeight: "900", color: "#FFFFFF" },
  profileTagline: { fontSize: 13, color: "#71717A", marginTop: 3 },
  genderSelectorBtn: {
    width: "48%",
    backgroundColor: "#0B0F12",
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2630",
  },
  genderSelectorBtnActive: { backgroundColor: "#10B981", borderColor: "#10B981" },
  genderSelectorBtnText: { marginLeft: 8, fontSize: 13, fontWeight: "700", color: "#A1A1AA" },
  genderSelectorBtnTextActive: { color: "#0B0F12" },
  settingItem: {
    backgroundColor: "#131920",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 10,
  },
  settingItemLabel: { flex: 1, marginLeft: 12, fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  editInputLabel: { fontSize: 10, fontWeight: "800", color: "#10B981", alignSelf: "flex-start", marginBottom: 4 },
  editInputField: {
    backgroundColor: "#0B0F12",
    borderRadius: 10,
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 12,
  },
  fareResultDisplayBox: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10B981",
    marginVertical: 10,
  },
  fareResultDisplayLabel: { fontSize: 9, fontWeight: "800", color: "#10B981" },
  fareResultDisplayVal: { fontSize: 24, fontWeight: "900", color: "#10B981", marginTop: 2 },
  bottomDockBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#131920",
    height: 64,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#1E2630",
    paddingBottom: 4,
  },
  dockTabItem: { alignItems: "center" },
  dockTabLabel: { fontSize: 10, fontWeight: "600", color: "#71717A", marginTop: 3 },
  dockTabLabelActive: { color: "#10B981", fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: "#131920",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2630",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#FFFFFF", marginBottom: 12 },
  pinInputModal: {
    backgroundColor: "#0B0F12",
    borderRadius: 14,
    width: "100%",
    paddingVertical: 14,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "900",
    color: "#10B981",
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: "#1E2630",
    marginBottom: 20,
  },
  modalVerifyBtn: {
    width: "100%",
    backgroundColor: "#10B981",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  modalVerifyBtnText: { color: "#0B0F12", fontSize: 13, fontWeight: "800" },
  fakeCallScreen: {
    flex: 1,
    backgroundColor: "#050709",
    justifyContent: "space-between",
    paddingVertical: 60,
    alignItems: "center",
  },
  fakeCallTop: { alignItems: "center", marginTop: 40 },
  fakeCallIncomingText: { fontSize: 12, color: "#10B981", fontWeight: "900", letterSpacing: 2 },
  fakeCallCallerName: { fontSize: 28, fontWeight: "800", color: "#FFFFFF", marginTop: 10 },
  fakeCallAvatarBox: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#131920",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1E2630",
  },
  fakeCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },
  fakeCallBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", marginTop: 4 },
});