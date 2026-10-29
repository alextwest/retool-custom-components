import { useAppTheme } from "./theme";
import React, { useEffect, useState } from "react";
import { Retool } from "@tryretool/custom-component-support";

type PlaceSuggestion = {
  placePrediction?: {
    place: string;
    placeId: string;
    text?: {
      text?: string;
    };
    structuredFormat?: any;
    types?: string[];
  };
};

export const AddressAutoComplete = () => {
  const appThemeStyle = useAppTheme();
  const [apiKey] = Retool.useStateString({
    name: "apiKey",
  });

  const [placeholder] = Retool.useStateString({
    name: "placeholder",
    initialValue: "Search address...",
  });

  const [, setSelectedAddress] = Retool.useStateString({
    name: "selectedAddress",
    initialValue: "{}",
  });

  const [label] = Retool.useStateString({
    name: "label",
    initialValue: "Site Address",
  });

  const [required] = Retool.useStateBoolean({
    name: "required",
    initialValue: true,
  });

  // const [validationMessage] = Retool.useStateString({
  //   name: "validationMessage",
  //   initialValue: "This field is required.",
  // });

  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [skipNextSearch, setSkipNextSearch] = useState(false);
  const [selectedText, setSelectedText] = useState("");

  const [, setValue] = Retool.useStateString({
    name: "value",
    initialValue: "",
  });

  const [formDataKey] = Retool.useStateString({
    name: "formDataKey",
    initialValue: "site_address",
  });

  useEffect(() => {
    const fetchSuggestions = async () => {

      if (skipNextSearch) {
        setSkipNextSearch(false);
        setSuggestions([]);
        return;
      }

      if (
        !apiKey ||
        searchText.trim().length < 3 ||
        searchText.trim() === selectedText.trim()
      ) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          "https://places.googleapis.com/v1/places:autocomplete",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask":
                "suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
            },
            body: JSON.stringify({
              input: searchText,
              includedRegionCodes: ["us"],
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("Places autocomplete error:", data);
          setSuggestions([]);
          return;
        }

        setSuggestions(data.suggestions || []);
      } catch (error) {
        console.error("Places autocomplete fetch failed:", error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = window.setTimeout(fetchSuggestions, 300);
    return () => window.clearTimeout(timer);
  }, [apiKey, searchText, skipNextSearch, selectedText]);

  const getAddressPart = (components: any[] = [], type: string, short = false) => {
    const component = components.find((c) => c.types?.includes(type));
    if (!component) return "";

    return short
      ? component.shortText || component.short_name || ""
      : component.longText || component.long_name || "";
  };

  const handleSelect = async (placeResourceName: string) => {
    if (!apiKey) return;

    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/${placeResourceName}`,
        {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,location,addressComponents",
          },
        }
      );

      const place = await response.json();

      if (!response.ok) {
        console.error("Place details error:", place);
        return;
      }

      const components = place.addressComponents || [];

      const streetNumber = getAddressPart(components, "street_number");
      const route = getAddressPart(components, "route");
      const streetAddress = [streetNumber, route].filter(Boolean).join(" ");

      const result = {
        formattedAddress: place.formattedAddress || "",
        streetAddress,
        displayName: place.displayName?.text || "",
        placeId: place.id || "",
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
        city:
          getAddressPart(components, "locality") ||
          getAddressPart(components, "postal_town") ||
          getAddressPart(components, "sublocality"),
        state: getAddressPart(components, "administrative_area_level_1", true),
        postalCode: getAddressPart(components, "postal_code"),
        country: getAddressPart(components, "country", true),
        rawPlace: place,
      };

      setValue(result.formattedAddress);
      setSelectedAddress(JSON.stringify(result));
      setSelectedText(result.formattedAddress);
      setSearchText(result.formattedAddress);
      setSuggestions([]);
      setLoading(false);
    } catch (error) {
      console.error("Place details fetch failed:", error);
    }
  };

  // handle clear button to clear text field
  const handleClear = () => {
    setSearchText("");
    setSelectedText("");
    setSuggestions([]);
    setValue("");
    setSelectedAddress("{}");
    setLoading(false);
  };

  if (!apiKey) {
    return (
      <div style={{ ...appThemeStyle, padding: "8px", fontSize: "13px", color: "var(--app-warning, #b45309)" }}>
        Missing Google Maps API key.
      </div>
    );
  }

  return (
    <div style={{ ...appThemeStyle, position: "relative", width: "100%" }}>
      <label
        style={{
            display: "block",
            marginBottom: "4px",
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--app-text, #374151)",
        }}
        >
        {label}
        {required && <span style={{ color: "var(--app-danger, #dc2626)" }}> *</span>}
      </label>

      <input
        value={searchText}
        onChange={(event) => {
          setSelectedText("");
          setSearchText(event.target.value);
        }}
        placeholder={placeholder}
        style={{
        width: "100%",
        height: "32px",
        boxSizing: "border-box",
        padding: searchText ? "0 32px 0 8px" : "0 8px",
        border: "1px solid var(--app-border, #d1d5db)",
        borderRadius: "4px",
        fontSize: "12px",
        fontFamily: "inherit",
        color: "var(--app-text, #111827)",
        backgroundColor: "var(--app-surface, #ffffff)",
        outline: "none",
        }}
      />

      {searchText && (
        <button
        type="button"
        onClick={handleClear}
        style={{
            position: "absolute",
            right: "6px",
            top: "28px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: "14px",
            lineHeight: "14px",
            color: "var(--app-muted, #6b7280)",
            padding: "2px",
        }}
        >
        ×
        </button>
      )}

      {/* {required && !searchText && (
        <div
            style={{
            marginTop: "4px",
            fontSize: "12px",
            color: "var(--app-danger, #dc2626)",
            }}
        >
            ● {validationMessage}
        </div>
      )} */}

      {loading && (
        <div style={{ padding: "6px 8px", fontSize: "12px", color: "var(--app-muted, #6b7280)" }}>
          Searching...
        </div>
      )}

      {suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "54px",
            left: 0,
            right: 0,
            background: "var(--app-surface, #ffffff)",
            border: "1px solid var(--app-border, #d1d5db)",
            borderRadius: "4px",
            zIndex: 9999,
            maxHeight: "240px",
            overflowY: "auto",
            boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
          }}
        >
          {suggestions.map((suggestion, index) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) return null;

            return (
              <div
                key={`${prediction.placeId}-${index}`}
                onClick={() => handleSelect(prediction.place)}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--app-secondary, #f3f4f6)",
                  fontSize: "13px",
                }}
              >
                {prediction.text?.text || prediction.placeId}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};