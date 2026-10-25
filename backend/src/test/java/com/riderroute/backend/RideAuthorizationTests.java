package com.riderroute.backend;

import com.riderroute.backend.controller.ApiExceptionHandler;
import com.riderroute.backend.controller.RideController;
import com.riderroute.backend.dto.AuthResponse;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RideStatus;
import com.riderroute.backend.model.RiderSession;
import com.riderroute.backend.service.AuthService;
import com.riderroute.backend.service.RideService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.ArrayList;
import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RideAuthorizationTests {
    private final RideService rides = mock(RideService.class);
    private final AuthService auth = mock(AuthService.class);
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        Ride ride = new Ride();
        ride.setLeaderId("leader");
        RiderSession rider = new RiderSession();
        rider.setUserId("rider");
        ride.setRiders(new ArrayList<>(List.of(rider)));
        when(rides.getRideById("ride-1")).thenReturn(ride);
        when(auth.getProfile(null)).thenThrow(new IllegalArgumentException("Missing Authorization token"));
        when(auth.getProfile("Bearer rider")).thenReturn(new AuthResponse.UserProfile("rider", "Rider", "rider@example.com"));
        when(auth.getProfile("Bearer leader")).thenReturn(new AuthResponse.UserProfile("leader", "Leader", "leader@example.com"));
        when(auth.getProfile("Bearer stranger")).thenReturn(new AuthResponse.UserProfile("stranger", "Stranger", "stranger@example.com"));
        mvc = MockMvcBuilders.standaloneSetup(new RideController(rides, auth)).setControllerAdvice(new ApiExceptionHandler()).build();
    }

    @Test
    void anonymousRequestsCannotReadRidesOrChangeStatus() throws Exception {
        mvc.perform(get("/api/rides/ride-1")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/rides/ride-1/status?status=COMPLETED")).andExpect(status().isUnauthorized());
        verify(rides, never()).updateRideStatus(anyString(), any());
    }

    @Test
    void normalRiderCannotCloseWholeRideOrImpersonateAnotherRider() throws Exception {
        mvc.perform(patch("/api/rides/ride-1/status?status=COMPLETED").header("Authorization", "Bearer rider"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/rides/ride-1/riders/other/close").header("Authorization", "Bearer rider"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/rides/ride-1/riders/other/wrong-route-alert?fromUserId=leader").header("Authorization", "Bearer rider"))
                .andExpect(status().isForbidden());
        verify(rides, never()).updateRideStatus(anyString(), any());
        verify(rides, never()).closeRideForRider(anyString(), anyString());
        verify(rides, never()).alertWrongRoute(anyString(), anyString(), anyString());
    }

    @Test
    void creatorCanChangeStatusAndRiderCanLeaveOnlyForThemselves() throws Exception {
        mvc.perform(patch("/api/rides/ride-1/status?status=COMPLETED").header("Authorization", "Bearer leader"))
                .andExpect(status().isOk());
        verify(rides).updateRideStatus("ride-1", RideStatus.COMPLETED);
        mvc.perform(post("/api/rides/ride-1/riders/rider/close").header("Authorization", "Bearer rider"))
                .andExpect(status().isOk());
        verify(rides).closeRideForRider("ride-1", "rider");
    }

    @Test
    void waitingRideHidesRidersFromNormalMembersButKeepsRideDetails() throws Exception {
        Ride ride = rides.getRideById("ride-1");
        ride.setName("Waiting trip");
        ride.setCode("ABC123");
        ride.setDistanceMeters(12500.0);
        ride.setDurationSeconds(1500.0);
        ride.getRiders().get(0).setUserName("Private Rider");
        ride.getRiders().get(0).setLocation(new com.riderroute.backend.model.LatLng(12, 77));
        when(rides.getRideByCode("ABC123")).thenReturn(ride);
        when(rides.listRidesByUser("rider")).thenReturn(List.of(ride));

        mvc.perform(get("/api/rides/ride-1").header("Authorization", "Bearer rider"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.riders").isEmpty())
                .andExpect(jsonPath("$.name").value("Waiting trip"))
                .andExpect(jsonPath("$.distanceMeters").value(12500.0))
                .andExpect(jsonPath("$.durationSeconds").value(1500.0));
        mvc.perform(get("/api/rides/by-code/ABC123").header("Authorization", "Bearer rider"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.riders").isEmpty());
        mvc.perform(get("/api/rides/user/rider").header("Authorization", "Bearer rider"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].riders").isEmpty());
        mvc.perform(get("/api/rides/ride-1").header("Authorization", "Bearer leader"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.riders[0].userName").value("Private Rider"));

        ride.setStatus(RideStatus.ACTIVE);
        mvc.perform(get("/api/rides/ride-1").header("Authorization", "Bearer rider"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.riders[0].userName").value("Private Rider"));
    }

    @Test
    void joinAndLocationResponsesDoNotLeakWaitingRiderData() throws Exception {
        Ride ride = rides.getRideById("ride-1");
        when(rides.joinRide(eq("ride-1"), any())).thenReturn(ride);
        when(rides.updateLocation(eq("ride-1"), eq("rider"), any())).thenReturn(ride);

        mvc.perform(post("/api/rides/ride-1/join").header("Authorization", "Bearer rider")
                .contentType("application/json").content("{\"userId\":\"rider\",\"userName\":\"Rider\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.riders").isEmpty());
        mvc.perform(patch("/api/rides/ride-1/riders/rider/location").header("Authorization", "Bearer rider")
                .contentType("application/json").content("{\"location\":{\"lat\":12,\"lng\":77}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.riders").isEmpty());
    }

    @Test
    void outsidersCannotReadRideDetailsOrOtherUsersHistory() throws Exception {
        mvc.perform(get("/api/rides/ride-1").header("Authorization", "Bearer stranger"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/rides/user/leader").header("Authorization", "Bearer rider"))
                .andExpect(status().isForbidden());
    }
}