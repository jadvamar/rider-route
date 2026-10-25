package com.riderroute.backend.repository;

import com.riderroute.backend.model.Ride;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.util.Optional;
import java.util.List;

public interface RideRepository extends MongoRepository<Ride, String> {
    Optional<Ride> findByCode(String code);

    @Query(value = "{ '$or': [ { 'leaderId': ?0 }, { 'riders.userId': ?1 } ] }",
            fields = "{ 'route': 0, 'riders.routeFollowed': 0, 'riders.location': 0, 'activeSOS': 0 }")
    List<Ride> findByLeaderIdOrRidersUserId(String leaderId, String userId);
}
