AHP Decision-Making Tool
An interactive web application for making complex decisions using the Analytic Hierarchy Process (AHP). This tool guides users through a structured workflow to break down a decision into a hierarchy of goals, criteria, and alternatives, allowing for a systematic and rational evaluation.

Table of Contents
Overview

Features

How to Use

Technology Stack

Reporting

Contributing

Overview
The Analytic Hierarchy Process (AHP) is a structured technique for organizing and analyzing complex decisions. This tool provides a user-friendly interface to apply the AHP methodology, turning a sophisticated decision-making process into a series of simple, manageable steps. It's designed for individuals or teams who need to make a justifiable and well-documented choice from a set of options based on multiple, competing criteria.

For a detailed explanation of the AHP methodology, please refer to the AHP Process doc from Dr. Stuart Burge (https://www.burgehugheswalsh.co.uk/Uploaded/1/Documents/Analytic-Hierarchy-Process-Tool-v2.pdf)

Features
This tool implements the full AHP workflow in five intuitive steps:

Define Goal, Criteria & Options:

Start by defining the main objective of your decision.

Add, remove, and reorder the criteria that are important for the decision.

List all the alternative options you are considering.

Pairwise Comparison:

Use intuitive, bidirectional sliders to compare each pair of criteria against each other.

Get real-time feedback with clear descriptions of the "Intensity of Importance" for each judgment, based on Saaty's 1-9 scale.

The tool automatically calculates the weights of the criteria and checks the consistency of your judgments with a Consistency Ratio (CR).

Define Utility Functions:

For each criterion, define how its performance translates into a "utility" score (from 0 to 100).

Quantitative Criteria: Define utility using either a mathematical formula (e.g., 100 - x/1000) or by plotting points on a table.

Qualitative Criteria: Define discrete levels (e.g., "High," "Medium," "Low") and assign a utility score to each.

An interactive chart visualizes the utility function for immediate feedback.

Evaluate Alternatives:

Score each alternative against each criterion.

For quantitative criteria, input a numerical value.

For qualitative criteria, select the appropriate level from a dropdown menu.

The corresponding utility score is instantly displayed for each input.

View Results & Export:

See the final, ranked list of alternatives based on their total weighted scores.

Visualize the results with a clear bar chart.

Generate a comprehensive, leadership-focused report that opens in a new tab for printing or saving as a PDF.

How to Use
Step 1: Enter your decision objective. Add all the criteria you want to evaluate and the options you are choosing between.

Step 2: Use the sliders to compare your criteria. Adjust until the weights and consistency ratio are satisfactory.

Step 3: For each criterion, choose whether it's quantitative or qualitative. Define the utility function using either a formula or a table of values.

Step 4: Input the performance value for each option against each criterion.

Step 5: Review the final ranking. Click "Generate Printable Report" to see the detailed analysis.

Technology Stack
React: For building the user interface.

Tailwind CSS: For styling the application.

Chart.js: For visualizing utility functions and final results.

React Beautiful DnD: For drag-and-drop functionality.

Reporting
The tool generates a detailed, multi-page report designed for clarity and easy communication with stakeholders. The report includes:

Executive Summary: States the decision goal and the final recommendation.

Final Ranking: A clear table showing the final scores and ranking of all options.

Criteria Weights: A breakdown of the calculated importance of each criterion.

Appendix: Contains the detailed data, including:

A simplified visualization of the pairwise comparisons.

A summary of all defined utility functions.

The raw evaluation data for each option.

Contributing
Contributions are welcome! If you have suggestions for improvements or find a bug, please feel free to open an issue or submit a pull request.

Fork the repository.

Create your feature branch (git checkout -b feature/AmazingFeature).

Commit your changes (git commit -m 'Add some AmazingFeature').

Push to the branch (git push origin feature/AmazingFeature).

Open a Pull Request.
