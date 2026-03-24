package com.riderroute.backend.dto;

import com.riderroute.backend.model.LatLng;
import jakarta.validation.constraints.NotNull;

public class LocationUpdateRequest {
    @NotNull
    private LatLng location;
    private double heading;
    private double speed;
    private boolean onRoute = true;

    public LatLng getLocation() {
        return location;
    }

    public void setLocation(LatLng location) {
        this.location = location;
    }

    public double getHeading() {
        return heading;
    }

    public void setHeading(double heading) {
        this.heading = heading;
    }

    public double getSpeed() {
        return speed;
    }

    public void setSpeed(double speed) {
        this.speed = speed;
    }

    public boolean isOnRoute() {
        return onRoute;
    }

    public void setOnRoute(boolean onRoute) {
        this.onRoute = onRoute;
    }
}
