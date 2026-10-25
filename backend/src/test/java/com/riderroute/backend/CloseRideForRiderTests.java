package com.riderroute.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.riderroute.backend.dto.LocationUpdateRequest;
import com.riderroute.backend.model.LatLng;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RideStatus;
import com.riderroute.backend.model.RiderSession;
import com.riderroute.backend.repository.RideRepository;
import com.riderroute.backend.service.RideService;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CloseRideForRiderTests {

    private RiderSession rider(String id) {
        RiderSession rider = new RiderSession();
        rider.setUserId(id);
        rider.setUserName(id);
        rider.setOnline(true);
        rider.setLocation(new LatLng(12, 77));
        return rider;
    }

    private Ride activeRide() {
        Ride ride = new Ride();
        ride.setId("ride-1");
        ride.setLeaderId("leader");
        ride.setStatus(RideStatus.ACTIVE);
        ride.setRiders(new ArrayList<>(List.of(rider("leader"), rider("rider"), rider("other"))));
        return ride;
    }

    private RideService serviceFor(Ride ride) {
        RideRepository repository = mock(RideRepository.class);
        when(repository.findById("ride-1")).thenReturn(Optional.of(ride));
        when(repository.save(any(Ride.class))).thenAnswer(invocation -> invocation.getArgument(0));
        return new RideService(repository);
    }

    private RiderSession find(Ride ride, String id) {
        return ride.getRiders().stream().filter(r -> id.equals(r.getUserId())).findFirst().orElseThrow();
    }

    @Test
    void closingOnlyClosesItForThatRider() {
        Ride ride = activeRide();
        serviceFor(ride).closeRideForRider("ride-1", "rider");

        assertTrue(find(ride, "rider").isClosed());
        assertNotNull(find(ride, "rider").getClosedAt());
        assertFalse(find(ride, "rider").isOnline());
        assertFalse(find(ride, "other").isClosed());
        assertFalse(find(ride, "leader").isClosed());
        assertEquals(RideStatus.ACTIVE, ride.getStatus(), "ride keeps going for everyone else");
    }

    @Test
    void leaderCannotUsePerRiderClose() {
        Ride ride = activeRide();
        assertThrows(IllegalArgumentException.class, () -> serviceFor(ride).closeRideForRider("ride-1", "leader"));
    }

    @Test
    void closingErasesTheRidersSharedLocation() {
        Ride ride = activeRide();
        find(ride, "rider").setRouteFollowed(new ArrayList<>(List.of(new LatLng(12, 77))));
        serviceFor(ride).closeRideForRider("ride-1", "rider");

        assertNull(find(ride, "rider").getLocation());
        assertTrue(find(ride, "rider").getRouteFollowed().isEmpty());
        assertNotNull(find(ride, "other").getLocation());
    }

    @Test
    void deletingFromHistoryErasesLocationForRiderOrLeaderAndIgnoresLaterUpdates() {
        Ride ride = activeRide();
        RideService service = serviceFor(ride);
        service.hideRideForUser("ride-1", "leader");
        service.hideRideForUser("ride-1", "rider");

        for (String id : List.of("leader", "rider")) {
            assertTrue(find(ride, id).isLeft());
            assertNull(find(ride, id).getLocation());
            assertFalse(find(ride, id).isOnline());
        }
        assertEquals("rider", find(ride, "rider").getUserName(), "name is kept for the summary");
        assertEquals(RideStatus.ACTIVE, ride.getStatus());

        LocationUpdateRequest update = new LocationUpdateRequest();
        update.setLocation(new LatLng(13, 78));
        service.updateLocation("ride-1", "leader", update);
        assertNull(find(ride, "leader").getLocation());
        assertNotNull(find(ride, "other").getLocation());
    }

    @Test
    void rejoiningAfterDeletingSharesLocationAgain() {
        Ride ride = activeRide();
        RideService service = serviceFor(ride);
        service.hideRideForUser("ride-1", "rider");

        com.riderroute.backend.dto.JoinRideRequest join = new com.riderroute.backend.dto.JoinRideRequest();
        join.setUserId("rider");
        join.setUserName("rider");
        join.setLocation(new LatLng(14, 79));
        service.joinRide("ride-1", join);

        assertFalse(find(ride, "rider").isLeft());
        assertEquals(14, find(ride, "rider").getLocation().lat());
    }

    @Test
    void rejoiningAfterClosingAndDeletingReopensOnlyThatRider() {
        Ride ride = activeRide();
        RideService service = serviceFor(ride);
        service.closeRideForRider("ride-1", "rider");
        service.hideRideForUser("ride-1", "rider");

        com.riderroute.backend.dto.JoinRideRequest join = new com.riderroute.backend.dto.JoinRideRequest();
        join.setUserId("rider");
        join.setUserName("rider");
        join.setLocation(new LatLng(14, 79));
        service.joinRide("ride-1", join);

        RiderSession rejoined = find(ride, "rider");
        assertFalse(rejoined.isClosed());
        assertFalse(rejoined.isLeft());
        assertNull(rejoined.getClosedAt());
        assertTrue(rejoined.isOnline());
        assertEquals(14, rejoined.getLocation().lat());
        assertFalse(ride.getHiddenFor().contains("rider"));
        assertEquals(3, ride.getRiders().size());
        assertEquals(RideStatus.ACTIVE, ride.getStatus());
    }

    @Test
    void completedRideCannotBeRejoined() {
        Ride ride = activeRide();
        RideService service = serviceFor(ride);
        service.closeRideForRider("ride-1", "rider");
        ride.setStatus(RideStatus.COMPLETED);
        com.riderroute.backend.dto.JoinRideRequest join = new com.riderroute.backend.dto.JoinRideRequest();
        join.setUserId("rider");
        join.setUserName("rider");

        assertThrows(IllegalArgumentException.class, () -> service.joinRide("ride-1", join));
        assertTrue(find(ride, "rider").isClosed());
        assertEquals(RideStatus.COMPLETED, ride.getStatus());
    }

    @Test
    void lateLocationUpdatesDoNotReopenAClosedRider() {
        Ride ride = activeRide();
        RideService service = serviceFor(ride);
        service.closeRideForRider("ride-1", "rider");

        LocationUpdateRequest update = new LocationUpdateRequest();
        update.setLocation(new LatLng(13, 78));
        service.updateLocation("ride-1", "rider", update);

        assertTrue(find(ride, "rider").isClosed());
        assertFalse(find(ride, "rider").isOnline());
        assertNull(find(ride, "rider").getLocation());
    }

    @Test
    void wrongRouteAlertIsStoredForOnlyTheTargetRiderAndDeliveredInRideData() throws Exception {
        Ride ride = activeRide();
        RideService service = serviceFor(ride);

        service.alertWrongRoute("ride-1", "rider", "leader");

        var notification = find(ride, "rider").getWrongRouteAlert();
        assertNotNull(notification);
        assertEquals("leader", notification.fromUserId());
        assertEquals("leader", notification.fromUserName());
        assertNotNull(notification.id());
        assertTrue(notification.timestamp() > 0);
        assertNull(find(ride, "other").getWrongRouteAlert());
        assertNull(find(ride, "leader").getWrongRouteAlert());
        assertTrue(new ObjectMapper().findAndRegisterModules().writeValueAsString(ride).contains(notification.id()));

        service.alertWrongRoute("ride-1", "rider", "leader");
        assertNotEquals(notification.id(), find(ride, "rider").getWrongRouteAlert().id());
        service.closeRideForRider("ride-1", "rider");
        assertNull(find(ride, "rider").getWrongRouteAlert());
    }

    @Test
    void wrongRouteAlertsRequireAnActiveRideAndParticipatingRiders() {
        Ride ride = activeRide();
        RideService service = serviceFor(ride);
        assertThrows(IllegalArgumentException.class, () -> service.alertWrongRoute("ride-1", "rider", "stranger"));
        service.closeRideForRider("ride-1", "rider");
        assertThrows(IllegalArgumentException.class, () -> service.alertWrongRoute("ride-1", "rider", "leader"));
        assertThrows(IllegalArgumentException.class, () -> service.alertWrongRoute("ride-1", "other", "rider"));
        ride.setStatus(RideStatus.COMPLETED);
        assertThrows(IllegalArgumentException.class, () -> service.alertWrongRoute("ride-1", "other", "leader"));
    }

    @Test
    void closedFlagIsSentToClients() throws Exception {
        Ride ride = activeRide();
        serviceFor(ride).closeRideForRider("ride-1", "rider");
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(ride);
        assertTrue(json.contains("\"closed\":true"));
    }
}
