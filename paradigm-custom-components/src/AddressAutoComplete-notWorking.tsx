import React, { useEffect, useRef } from "react";
import { Retool } from "@tryretool/custom-component-support";

type AddressResult = {
  formattedAddress?: string;
  displayName?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  rawPlace?: any;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "gmpx-api-loader": any;
      "gmpx-place-picker": any;
    }
  }
}

export const AddressAutoComplete = () => {
  const [apiKey] = Retool.useStateString({
    name: "apiKey",
  });

  const [placeholder] = Retool.useStateString({
    name: "placeholder",
    initialValue: "Search address...",
  });

  const [selectedAddress, setSelectedAddress] = Retool.useStateObject({
    name: "selectedAddress",
    initialValue: {},
  });

  const [googleReady, setGoogleReady] = React.useState(false);

  const pickerRef = useRef<any>(null);
  //const apiLoaderRef = useRef<any>(null);

  useEffect(() => {
    const scriptId = "google-maps-extended-component-library";

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "module";
      script.src =
        "https://ajax.googleapis.com/ajax/libs/@googlemaps/extended-component-library/0.6.15/index.min.js";
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;

    const handlePlaceChange = () => {
      const place = picker.value;

      if (!place) return;

      const components = place.addressComponents || [];

      const getComponent = (type: string, useShortName = false) => {
        const component = components.find((c: any) =>
          c.types?.includes(type)
        );

        if (!component) return "";

        return useShortName
          ? component.shortText || component.short_name || ""
          : component.longText || component.long_name || "";
      };

      const streetNumber = getComponent("street_number");
      const route = getComponent("route");
      const streetAddress = [streetNumber, route].filter(Boolean).join(" ");

      const result: AddressResult = {
        formattedAddress: place.formattedAddress || streetAddress,
        displayName: place.displayName || "",
        placeId: place.id || place.placeId || "",
        latitude:
          typeof place.location?.lat === "function"
            ? place.location.lat()
            : place.location?.lat,
        longitude:
          typeof place.location?.lng === "function"
            ? place.location.lng()
            : place.location?.lng,
        city:
          getComponent("locality") ||
          getComponent("postal_town") ||
          getComponent("sublocality"),
        state: getComponent("administrative_area_level_1", true),
        postalCode: getComponent("postal_code"),
        country: getComponent("country", true),
        rawPlace: place,
      };

      setSelectedAddress(result);
    };

    picker.addEventListener("gmpx-placechange", handlePlaceChange);

    return () => {
      picker.removeEventListener("gmpx-placechange", handlePlaceChange);
    };
  }, [setSelectedAddress]);

  useEffect(() => {
    if (!apiKey) return;

    const scriptId = "google-maps-extended-component-library";

    const setupLoader = async () => {
        await customElements.whenDefined("gmpx-api-loader");

        if (!document.getElementById("google-maps-api-loader")) {
        const loader = document.createElement("gmpx-api-loader");
        loader.id = "google-maps-api-loader";
        loader.setAttribute("key", apiKey);
        loader.setAttribute("solution-channel", "GMP_CCS_autocomplete_v5");
        document.body.appendChild(loader);
        }

        await customElements.whenDefined("gmpx-place-picker");
        setGoogleReady(true);
    };

    if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.type = "module";
        script.src =
        "https://ajax.googleapis.com/ajax/libs/@googlemaps/extended-component-library/0.6.15/index.min.js";
        script.onload = setupLoader;
        document.head.appendChild(script);
    } else {
        setupLoader();
    }
  }, [apiKey]);

  if (!apiKey) {
    return (
      <div style={{ padding: "8px", fontSize: "13px", color: "#b45309" }}>
        Missing Google Maps API key.
      </div>
    );
  }

  if (!googleReady) {
    return (
      <div style={{ padding: "8px", fontSize: "13px", color: "#b45309" }}>
        Loading address autocomplete...
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
        <gmpx-place-picker
        ref={pickerRef}
        placeholder={placeholder}
        type="address"
        style={{
            width: "100%",
            boxSizing: "border-box",
        }}
        />
    </div>
  );
};