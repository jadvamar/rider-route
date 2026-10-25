package com.riderroute.backend;

import com.mongodb.MongoException;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.SOSAlert;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class RideConcurrencyIntegrationTests {
    @Test
    void legacyAndNewDocumentsRejectStaleSavesWithoutLosingSOS() {
        String database = "rider_route_test_" + UUID.randomUUID().toString().replace("-", "");
        try (MongoClient client = MongoClients.create("mongodb://localhost:27017/?serverSelectionTimeoutMS=1000")) {
            try {
                client.getDatabase("admin").runCommand(new Document("ping", 1));
            } catch (MongoException unavailable) {
                assumeTrue(false, "Local MongoDB is not running");
            }
            MongoTemplate template = new MongoTemplate(client, database);
            try {
                template.getCollection("rides").insertOne(new Document("_id", "legacy-ride").append("name", "Legacy"));
                Ride legacy = template.findById("legacy-ride", Ride.class);
                assertNotNull(legacy);
                legacy.setName("Updated legacy");
                template.save(legacy);
                assertEquals("Updated legacy", template.findById("legacy-ride", Ride.class).getName());

                Ride created = template.save(new Ride());
                Ride first = template.findById(created.getId(), Ride.class);
                Ride stale = template.findById(created.getId(), Ride.class);
                assertNotNull(first);
                assertNotNull(stale);
                first.setActiveSOS(new SOSAlert("rider", "Rider", null, 1000L));
                template.save(first);
                stale.setName("Stale update");

                assertThrows(OptimisticLockingFailureException.class, () -> template.save(stale));
                Ride saved = template.findById(created.getId(), Ride.class);
                assertNotNull(saved);
                assertEquals("rider", saved.getActiveSOS().getUserId());
                assertNotEquals("Stale update", saved.getName());
                saved.setLeaderId("history-user");
                saved.setRoute(java.util.List.of(new com.riderroute.backend.model.LatLng(12, 77)));
                saved.setDistanceMeters(1500.0);
                saved.setDurationSeconds(300.0);
                template.save(saved);
                var repository = new org.springframework.data.mongodb.repository.support.MongoRepositoryFactory(template)
                    .getRepository(com.riderroute.backend.repository.RideRepository.class);
                var history = repository.findByLeaderIdOrRidersUserId("history-user", "history-user");
                assertEquals(1, history.size());
                assertEquals(saved.getId(), history.get(0).getId());
                assertTrue(history.get(0).getRoute().isEmpty());
                assertNull(history.get(0).getActiveSOS());
                assertEquals(1500.0, history.get(0).getDistanceMeters());
                assertEquals(300.0, history.get(0).getDurationSeconds());
                assertEquals(1, template.findById(saved.getId(), Ride.class).getRoute().size());
            } finally {
                client.getDatabase(database).drop();
            }
        }
    }
}