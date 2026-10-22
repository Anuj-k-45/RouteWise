
package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;

public class DistanceCalculator {

    private static final double EARTH_RADIUS_KM = 6371.0;

    public double calculateDistance(
            DeliveryPoint point1,
            DeliveryPoint point2) {

        double lat1 = Math.toRadians(point1.getLatitude());
        double lon1 = Math.toRadians(point1.getLongitude());

        double lat2 = Math.toRadians(point2.getLatitude());
        double lon2 = Math.toRadians(point2.getLongitude());

        double latDifference = lat2 - lat1;
        double lonDifference = lon2 - lon1;

        double a = Math.sin(latDifference / 2)
                * Math.sin(latDifference / 2)
                + Math.cos(lat1)
                        * Math.cos(lat2)
                        * Math.sin(lonDifference / 2)
                        * Math.sin(lonDifference / 2);

        double c = 2 * Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a));

        return EARTH_RADIUS_KM * c;
    }
}
