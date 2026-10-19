package com.riderroute.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Document(collection = "rides")
public class Ride {

    @Id
    private String id;
    private String name;
    private String code;
    private String leaderId;
    private LatLng startLocation;
    private LatLng destination;
    private String startAddress;
    private String destAddress;
    private List<LatLng> route = new ArrayList<>();
    private Double distanceMeters;
    private Double durationSeconds;

    public Double getDistanceMeters() {
        return distanceMeters;
    }

    public void setDistanceMeters(Double distanceMeters) {
        this.distanceMeters = distanceMeters;
    }

    public Double getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(Double durationSeconds) {
        this.durationSeconds = durationSeconds;
    }
    private RideStatus status = RideStatus.WAITING;
    private Instant createdAt = Instant.now();
    private List<RiderSession> riders = new ArrayList<>();
    private SOSAlert activeSOS;
    /** Users who removed this ride from their own Recent Rides; it stays visible to everyone else. */
    private Set<String> hiddenFor = new HashSet<>();

    @JsonIgnore
    public Set<String> getHiddenFor() {
        return hiddenFor;
    }

    public void setHiddenFor(Set<String> hiddenFor) {
        this.hiddenFor = hiddenFor;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getLeaderId() {
        return leaderId;
    }

    public void setLeaderId(String leaderId) {
        this.leaderId = leaderId;
    }

    public LatLng getStartLocation() {
        return startLocation;
    }

    public void setStartLocation(LatLng startLocation) {
        this.startLocation = startLocation;
    }

    public LatLng getDestination() {
        return destination;
    }

    public void setDestination(LatLng destination) {
        this.destination = destination;
    }

    public String getStartAddress() {
        return startAddress;
    }

    public void setStartAddress(String startAddress) {
        this.startAddress = startAddress;
    }

    public String getDestAddress() {
        return destAddress;
    }

    public void setDestAddress(String destAddress) {
        this.destAddress = destAddress;
    }

    public List<LatLng> getRoute() {
        return route;
    }

    public void setRoute(List<LatLng> route) {
        this.route = route;
    }

    public RideStatus getStatus() {
        return status;
    }

    public void setStatus(RideStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public List<RiderSession> getRiders() {
        return riders;
    }

    public void setRiders(List<RiderSession> riders) {
        this.riders = riders;
    }

    public SOSAlert getActiveSOS() {
        return activeSOS;
    }

    public void setActiveSOS(SOSAlert activeSOS) {
        this.activeSOS = activeSOS;
    }
}
