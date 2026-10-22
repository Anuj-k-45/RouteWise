
package com.routewise.routewise_backend.dto;

import com.routewise.routewise_backend.model.DeliveryPoint;

import java.util.List;

public class RouteOptimizationResponse {

    private List<DeliveryPoint> originalRoute;
    private List<DeliveryPoint> optimizedRoute;

    private double originalDistanceKm;
    private double optimizedDistanceKm;
    private double distanceSavedKm;

    public RouteOptimizationResponse() {
    }

    public RouteOptimizationResponse(
            List<DeliveryPoint> originalRoute,
            List<DeliveryPoint> optimizedRoute,
            double originalDistanceKm,
            double optimizedDistanceKm) {

        this.originalRoute = originalRoute;
        this.optimizedRoute = optimizedRoute;
        this.originalDistanceKm = originalDistanceKm;
        this.optimizedDistanceKm = optimizedDistanceKm;
        this.distanceSavedKm = originalDistanceKm - optimizedDistanceKm;
    }

    public List<DeliveryPoint> getOriginalRoute() {
        return originalRoute;
    }

    public void setOriginalRoute(List<DeliveryPoint> originalRoute) {
        this.originalRoute = originalRoute;
    }

    public List<DeliveryPoint> getOptimizedRoute() {
        return optimizedRoute;
    }

    public void setOptimizedRoute(List<DeliveryPoint> optimizedRoute) {
        this.optimizedRoute = optimizedRoute;
    }

    public double getOriginalDistanceKm() {
        return originalDistanceKm;
    }

    public void setOriginalDistanceKm(double originalDistanceKm) {
        this.originalDistanceKm = originalDistanceKm;
    }

    public double getOptimizedDistanceKm() {
        return optimizedDistanceKm;
    }

    public void setOptimizedDistanceKm(double optimizedDistanceKm) {
        this.optimizedDistanceKm = optimizedDistanceKm;
    }

    public double getDistanceSavedKm() {
        return distanceSavedKm;
    }

    public void setDistanceSavedKm(double distanceSavedKm) {
        this.distanceSavedKm = distanceSavedKm;
    }
}
