package com.garage;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.sql.*;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;

public class GarageServiceApp {

    private static final double TWO_WHEELER_COST = 500.0;
    private static final double THREE_WHEELER_COST = 750.0;
    private static final double FOUR_WHEELER_COST = 1000.0;

    private static final String DB_URL = "jdbc:mysql://localhost:3306/garageservicedb?useSSL=false";
    private static final String DB_USER = "pavan";
    private static final String DB_PASSWORD = "peeter";

    // Twilio Account Details
    public static final String ACCOUNT_SID = ""; //here enter the twilio api token sid code.....
    public static final String AUTH_TOKEN = ""; //twilio api token code

    static {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
            Twilio.init(ACCOUNT_SID, AUTH_TOKEN); // Initialize Twilio API
        } catch (ClassNotFoundException e) {
            System.err.println("MySQL JDBC Driver not found: " + e.getMessage());
        }
    }

    public GarageServiceApp() {
        JFrame frame = new JFrame("Garage Service's");
        frame.setSize(500, 600);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setLayout(new GridBagLayout());
        frame.getContentPane().setBackground(new Color(230, 230, 250));

        JLabel selectLabel = new JLabel("Select Vehicle Type:");
        JButton bikeButton = new JButton("2 Wheeler");
        JButton threeWheelerButton = new JButton("3 Wheeler");
        JButton fourWheelerButton = new JButton("4 Wheeler");
        JCheckBox premiumMembership = new JCheckBox("Premium Membership");

        JLabel nameLabel = new JLabel("Name:");
        JTextField nameField = new JTextField(15);
        JLabel contactLabel = new JLabel("Contact:");
        JTextField contactField = new JTextField(15);
        JComboBox<String> vehicleCombo = new JComboBox<>(new String[]{"2 Wheeler", "3 Wheeler", "4 Wheeler"});
        JButton bookButton = new JButton("Book Now");
        JLabel costLabel = new JLabel("Service Cost: ₹0");
        costLabel.setFont(new Font("Arial", Font.BOLD, 16));
        costLabel.setForeground(new Color(0, 102, 204));

        JLabel feedbackLabel = new JLabel("Customer Feedback:");
        JTextArea feedbackArea = new JTextArea(3, 20);
        JButton submitFeedbackButton = new JButton("Submit Feedback");

        styleButton(bikeButton);
        styleButton(threeWheelerButton);
        styleButton(fourWheelerButton);
        styleButton(bookButton);
        styleButton(submitFeedbackButton);

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(10, 10, 10, 10);

        gbc.gridx = 0; gbc.gridy = 0; gbc.gridwidth = 3; frame.add(selectLabel, gbc);
        gbc.gridx = 0; gbc.gridy = 1; gbc.gridwidth = 1; frame.add(bikeButton, gbc);
        gbc.gridx = 1; gbc.gridy = 1; frame.add(threeWheelerButton, gbc);
        gbc.gridx = 2; gbc.gridy = 1; frame.add(fourWheelerButton, gbc);
        gbc.gridx = 0; gbc.gridy = 2; gbc.gridwidth = 3; frame.add(premiumMembership, gbc);

        gbc.gridx = 0; gbc.gridy = 3; gbc.gridwidth = 1; frame.add(nameLabel, gbc);
        gbc.gridx = 1; gbc.gridy = 3; gbc.gridwidth = 2; frame.add(nameField, gbc);

        gbc.gridx = 0; gbc.gridy = 4; gbc.gridwidth = 1; frame.add(contactLabel, gbc);
        gbc.gridx = 1; gbc.gridy = 4; gbc.gridwidth = 2; frame.add(contactField, gbc);

        gbc.gridx = 0; gbc.gridy = 5; gbc.gridwidth = 1; frame.add(vehicleCombo, gbc);
        gbc.gridx = 1; gbc.gridy = 5; gbc.gridwidth = 2; frame.add(bookButton, gbc);

        gbc.gridx = 0; gbc.gridy = 6; gbc.gridwidth = 3; frame.add(costLabel, gbc);

        gbc.gridx = 0; gbc.gridy = 7; gbc.gridwidth = 3; frame.add(feedbackLabel, gbc);
        gbc.gridx = 0; gbc.gridy = 8; gbc.gridwidth = 3; frame.add(new JScrollPane(feedbackArea), gbc);
        gbc.gridx = 0; gbc.gridy = 9; gbc.gridwidth = 3; frame.add(submitFeedbackButton, gbc);

        bikeButton.addActionListener(e -> updateServiceCost("2 Wheeler", premiumMembership.isSelected(), costLabel));
        threeWheelerButton.addActionListener(e -> updateServiceCost("3 Wheeler", premiumMembership.isSelected(), costLabel));
        fourWheelerButton.addActionListener(e -> updateServiceCost("4 Wheeler", premiumMembership.isSelected(), costLabel));

        premiumMembership.addActionListener(e -> {
            String selectedVehicle = (String) vehicleCombo.getSelectedItem();
            updateServiceCost(selectedVehicle, premiumMembership.isSelected(), costLabel);
        });

        bookButton.addActionListener(e -> handleBooking(nameField, contactField, vehicleCombo, premiumMembership, costLabel));
        submitFeedbackButton.addActionListener(e -> handleFeedback(feedbackArea));

        frame.setVisible(true);
        frame.setLocationRelativeTo(null);
    }

    private static void handleBooking(JTextField nameField, JTextField contactField, JComboBox<String> vehicleCombo, JCheckBox premiumMembership, JLabel costLabel) {
        String name = nameField.getText().trim();
        String contact = contactField.getText().trim();
        String vehicleType = (String) vehicleCombo.getSelectedItem();
        boolean isPremium = premiumMembership.isSelected();
        double cost = calculateCost(vehicleType, isPremium);

        if (name.isEmpty() || contact.isEmpty()) {
            JOptionPane.showMessageDialog(null, "Please fill in both Name and Contact fields.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        saveBookingToDatabase(name, contact, vehicleType, cost);
        String messageContent = String.format("Hello %s,\nYour booking for a %s is confirmed.\nService Type: %s\nContact: %s\nTotal Cost: ₹%.2f\nThank you for chooing our Garage Service's!😊👍",name, vehicleType, isPremium ? "Premium Service" : "Regular Service", contact, cost);
        sendSMS(contact, messageContent);
        JOptionPane.showMessageDialog(null, "Booking successful! SMS sent to the Customer.");

        nameField.setText("");
        contactField.setText("");
    }

    private static void handleFeedback(JTextArea feedbackArea) {
        String feedback = feedbackArea.getText().trim();

        if (feedback.isEmpty()) {
            JOptionPane.showMessageDialog(null, "Please enter feedback before submitting.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        saveFeedbackToDatabase(feedback);
        JOptionPane.showMessageDialog(null, "Feedback submitted successfully!");

        feedbackArea.setText("");
    }

    private static double calculateCost(String vehicleType, boolean isPremium) {
        double baseCost = switch (vehicleType) {
            case "2 Wheeler" -> TWO_WHEELER_COST;
            case "3 Wheeler" -> THREE_WHEELER_COST;
            case "4 Wheeler" -> FOUR_WHEELER_COST;
            default -> 0.0;
        };
        return isPremium ? baseCost * 0.9 : baseCost;
    }

    private static void updateServiceCost(String vehicleType, boolean isPremium, JLabel costLabel) {
        double cost = calculateCost(vehicleType, isPremium);
        costLabel.setText("Service Cost: ₹" + cost);
    }

    private static void styleButton(JButton button) {
        button.setFont(new Font("Arial", Font.BOLD, 14));
        button.setBackground(new Color(100, 149, 237));
        button.setForeground(Color.WHITE);
        button.setFocusPainted(false);
        button.setBorderPainted(false);
        button.setOpaque(true);
    }

    private static void saveBookingToDatabase(String name, String contact, String vehicleType, double cost) {
        String insertBookingSQL = "INSERT INTO GarageServiceBookings (name, contact, wheeler_type, cost) VALUES (?, ?, ?, ?)";

        try (Connection connection = DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
             PreparedStatement preparedStatement = connection.prepareStatement(insertBookingSQL)) {

            preparedStatement.setString(1, name);
            preparedStatement.setString(2, contact);
            preparedStatement.setString(3, vehicleType);
            preparedStatement.setDouble(4, cost);
            preparedStatement.executeUpdate();
            System.out.println("Booking saved to database.");

        } catch (SQLException e) {
            System.err.println("Error saving booking: " + e.getMessage());
        }
    }

    private static void saveFeedbackToDatabase(String feedback) {
        String insertFeedbackSQL = "INSERT INTO CustomerFeedback (feedback_text) VALUES (?)";

        try (Connection connection = DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
             PreparedStatement preparedStatement = connection.prepareStatement(insertFeedbackSQL)) {

            preparedStatement.setString(1, feedback);
            preparedStatement.executeUpdate();
            System.out.println("Feedback saved to database.");

        } catch (SQLException e) {
            System.err.println("Error saving feedback: " + e.getMessage());
        }
    }

    private static void sendSMS(String recipientNumber, String messageContent) {
        try {
            Message message = Message.creator(
                    new PhoneNumber(recipientNumber), // Customer's phone number
                    new PhoneNumber("+12813469685"), // Twilio phone number
                    messageContent
            ).create();

            System.out.println("SMS sent successfully: " + message.getSid());
        } catch (Exception e) {
            System.err.println("Failed to send SMS: " + e.getMessage());
        }
    }



    public static void main(String[] args) {
        // Welcome Screen
        JFrame welcomeFrame = new JFrame("Garage Service's");
        welcomeFrame.setSize(500, 600);
        welcomeFrame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        welcomeFrame.setLayout(null); // Using null layout

        // Load and scale the image
        ImageIcon originalImage = new ImageIcon("D:\\garage-services\\garageservice's.jpg");
        Image scaledImage = originalImage.getImage().getScaledInstance(
            welcomeFrame.getWidth(),
            welcomeFrame.getHeight(),
            Image.SCALE_SMOOTH
        );
        JLabel imageLabel = new JLabel(new ImageIcon(scaledImage));
        imageLabel.setBounds(0, 0, 500, 600); // Manually set bounds
        welcomeFrame.add(imageLabel); // Add image label first

        // Add the welcome label
        JLabel label = new JLabel("Welcome to Garage Service's");
        label.setBounds(100, 100, 300, 30); // Position it manually
        label.setFont(new Font("Arial", Font.BOLD, 20));
        imageLabel.add(label); // Add to the image label (to layer it above the image)

        // Add the "Enter" button
        JButton enter = new JButton("Enter") {
            @Override
            protected void paintComponent(Graphics g) {
                if (g instanceof Graphics2D) {
                    Graphics2D g2d = (Graphics2D) g;
                    int width = getWidth();
                    int height = getHeight();

                    // Create a gradient paint from top-left to bottom-right
                    GradientPaint gradientPaint = new GradientPaint(
                        0, 0, new Color(100, 149, 237),  // Start color
                        width, height, new Color(65, 105, 225) // End color
                    );

                    // Set the paint and fill the background
                    g2d.setPaint(gradientPaint);
                    g2d.fillRect(0, 0, width, height);
                }

                // Call the superclass to handle text and other details
                super.paintComponent(g);
            }
        };
        enter.setBounds(200, 300, 100, 30);
        enter.setForeground(Color.BLACK);  // Set text color
        enter.setFocusPainted(false);     // Remove focus border
        enter.setBorderPainted(false);   // Remove border
        enter.setOpaque(false);          // Enable transparency for gradient
        imageLabel.add(enter);           // Add button to the layered image label

        // Add action listener for the button
        enter.addActionListener((ActionEvent e) -> {
            new GarageServiceApp(); // Open the main application
            welcomeFrame.dispose(); // Close the welcome frame
        });

        // Finalize and display the frame
        welcomeFrame.setVisible(true);
        welcomeFrame.setLocationRelativeTo(null); // Center on screen
    }
}