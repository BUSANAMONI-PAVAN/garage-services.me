-- Active: 1731386532180@@127.0.0.1@3306
-- Create the database if it does not exist
CREATE DATABASE IF NOT EXISTS garageservicedb;

-- Use the database
USE garageservicedb;

-- Create the GarageServiceBookings table
CREATE TABLE GarageServiceBookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact VARCHAR(15) NOT NULL,
    wheeler_type VARCHAR(20) NOT NULL,
    cost DOUBLE NOT NULL,
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the CustomerFeedback table
CREATE TABLE CustomerFeedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    feedback_text TEXT NOT NULL,
    feedback_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES GarageServiceBookings(id)
);
