import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// --- AHP Calculation Helper Functions ---

/**
 * Calculates the priority vector (weights) from a pairwise comparison matrix.
 * @param {number[][]} pairwiseMatrix - The n x n matrix of pairwise comparisons.
 * @returns {number[]} An array of weights for each criterion.
 */
const calculateWeights = (pairwiseMatrix) => {
  if (!pairwiseMatrix || pairwiseMatrix.length === 0) {
    return [];
  }
  const numCriteria = pairwiseMatrix.length;
  const columnSums = Array(numCriteria).fill(0);

  // Sum each column
  for (let j = 0; j < numCriteria; j++) {
    for (let i = 0; i < numCriteria; i++) {
      columnSums[j] += pairwiseMatrix[i][j];
    }
  }

  // Normalize the matrix by dividing each element by its column sum
  const normalizedMatrix = pairwiseMatrix.map(row => row.slice());
  for (let j = 0; j < numCriteria; j++) {
    if (columnSums[j] === 0) continue;
    for (let i = 0; i < numCriteria; i++) {
      normalizedMatrix[i][j] /= columnSums[j];
    }
  }

  // Calculate the average of each row to get the weights
  const weights = Array(numCriteria).fill(0);
  for (let i = 0; i < numCriteria; i++) {
    weights[i] = normalizedMatrix[i].reduce((sum, val) => sum + val, 0) / numCriteria;
  }

  return weights;
};

/**
 * Calculates the consistency ratio (CR) to check for inconsistencies in judgments.
 * @param {number[][]} pairwiseMatrix - The n x n matrix of pairwise comparisons.
 * @param {number[]} weights - The calculated weights for each criterion.
 * @returns {{cr: number, isConsistent: boolean}} An object containing the consistency ratio and a boolean indicating if judgments are consistent.
 */
const calculateConsistency = (pairwiseMatrix, weights) => {
  const numCriteria = pairwiseMatrix.length;
  if (numCriteria <= 2) {
    return { cr: 0, isConsistent: true };
  }

  const weightedSumVector = Array(numCriteria).fill(0);
  for (let i = 0; i < numCriteria; i++) {
    for (let j = 0; j < numCriteria; j++) {
      weightedSumVector[i] += pairwiseMatrix[i][j] * weights[j];
    }
  }

  const consistencyVector = Array(numCriteria).fill(0);
  for (let i = 0; i < numCriteria; i++) {
    if (weights[i] !== 0) {
      consistencyVector[i] = weightedSumVector[i] / weights[i];
    }
  }

  const lambdaMax = consistencyVector.reduce((sum, val) => sum + val, 0) / numCriteria;
  const ci = (lambdaMax - numCriteria) / (numCriteria - 1);
  
  // Random Index (RI) from Saaty's scale for n=1 to 10
  const riMap = [0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];
  const ri = riMap[numCriteria-1] || 1.49; // Default to last value if > 10

  const cr = ri === 0 ? 0 : ci / ri;

  return { cr, isConsistent: cr < 0.1 };
};

/**
 * Safely evaluates a mathematical expression with a variable 'x'.
 * @param {string} expr - The mathematical expression string.
 * @param {number} x - The value to substitute for 'x'.
 * @returns {number | null} The result of the expression or null if invalid.
 */
const safeEval = (expr, x) => {
    try {
        if (/[^x\d\s()+\-*/.]/.test(expr)) {
            return null;
        }
        const func = new Function('x', `return ${expr}`);
        const result = func(x);
        return isNaN(result) ? null : result;
    } catch (error) {
        return null;
    }
};

/**
 * Performs linear interpolation for a value x based on a set of points.
 * @param {number} x - The value to interpolate.
 * @param {Array<{x: number, y: number}>} points - The sorted array of data points.
 * @returns {number} The interpolated y value.
 */
const interpolate = (x, points) => {
    if (points.length === 0) return 0;
    if (points.length === 1) return points[0].y;
    
    const sortedPoints = points.slice().sort((a,b) => a.x - b.x);

    if (x <= sortedPoints[0].x) return sortedPoints[0].y;
    if (x >= sortedPoints[sortedPoints.length - 1].x) return sortedPoints[sortedPoints.length - 1].y;

    let i = 0;
    while (i < sortedPoints.length && sortedPoints[i].x < x) {
        i++;
    }

    const p1 = sortedPoints[i - 1];
    const p2 = sortedPoints[i];
    
    if (p1.x === p2.x) return p1.y;

    const slope = (p2.y - p1.y) / (p2.x - p1.x);
    return p1.y + slope * (x - p1.x);
};

const normalizeMatrix = (matrix) => {
    const numCriteria = matrix.length;
    const normalized = Array(numCriteria).fill(0).map(() => Array(numCriteria).fill(0));
    const columnSums = Array(numCriteria).fill(0);

    for (let j = 0; j < numCriteria; j++) {
        for (let i = 0; i < numCriteria; i++) {
            columnSums[j] += matrix[i][j];
        }
    }

    for (let i = 0; i < numCriteria; i++) {
        for (let j = 0; j < numCriteria; j++) {
            normalized[i][j] = matrix[i][j] / columnSums[j];
        }
    }
    return normalized;
};

const calculateOptionValues = (options, criteria, utilityFunctions) => {
    const newOptionValues = {};
    options.forEach(option => {
        newOptionValues[option.id] = {};
        criteria.forEach(criterion => {
            const func = utilityFunctions[criterion.id];
            let utility = 0;
            if (func) {
                if (func.criterionType === 'qualitative') {
                    const selectedLabel = option.id[criterion.id];
                    const level = func.qualitativeLevels.find(l => l.label === selectedLabel);
                    if (level) {
                        utility = level.utility;
                    }
                } else {
                    const value = parseFloat(option.id[criterion.id]);
                    if (!isNaN(value)) {
                        if (func.mode === 'formula' && func.formulaString) {
                            const result = safeEval(func.formulaString, value);
                            if (result !== null) utility = result;
                        } else if (func.mode === 'table' && func.points && func.points.length > 0) {
                            utility = interpolate(value, func.points);
                        }
                    }
                }
            }
            newOptionValues[option.id][criterion.id] = Math.max(0, Math.min(100, utility));
        });
    });
    return newOptionValues;
};

const calculateFinalScores = (options, criteria, weights, optionValues) => {
    const scores = [];
    options.forEach(option => {
        let totalScore = 0;
        criteria.forEach((criterion, index) => {
            const utility = optionValues[option.id]?.[criterion.id] || 0;
            const weight = weights[index] || 0;
            totalScore += utility * weight;
        });
        scores.push({ optionId: option.id, score: totalScore });
    });
    return scores;
};

const checkConsistency = (matrix) => {
    const weights = calculateWeights(normalizeMatrix(matrix));
    return calculateConsistency(matrix, weights);
};


// --- React Components ---

const Card = ({ title, children }) => (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">{title}</h2>
        {children}
    </div>
);

const Step1 = ({ objective, setObjective, criteria, setCriteria, options, setOptions }) => {
  const [newCriterion, setNewCriterion] = useState('');
  const [newOption, setNewOption] = useState('');
  
  const garbageCanIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
  );
  
  const plusIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  );

  const addCriterion = () => {
    if (newCriterion.trim() && !criteria.find(c => c.id === newCriterion.trim())) {
      setCriteria([...criteria, {id: newCriterion.trim(), content: newCriterion.trim()}]);
      setNewCriterion('');
    }
  };

  const addOption = () => {
    if (newOption.trim() && !options.find(o => o.id === newOption.trim())) {
      setOptions([...options, {id: newOption.trim(), content: newOption.trim()}]);
      setNewOption('');
    }
  };
  
  const removeCriterion = (index) => {
      const newCriteria = [...criteria];
      newCriteria.splice(index, 1);
      setCriteria(newCriteria);
  }
  
  const removeOption = (index) => {
      const newOptions = [...options];
      newOptions.splice(index, 1);
      setOptions(newOptions);
  }

  const onDragEnd = (result) => {
    const { source, destination, type } = result;
    if (!destination) return;
    
    const list = type === 'CRITERIA' ? criteria : options;
    const setList = type === 'CRITERIA' ? setCriteria : setOptions;

    const items = Array.from(list);
    const [reorderedItem] = items.splice(source.index, 1);
    items.splice(destination.index, 0, reorderedItem);
    setList(items);
  };

  const renderList = (items, type) => (
    <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={type} type={type}>
            {(provided) => (
                <ul {...provided.droppableProps} ref={provided.innerRef} className="mt-2 space-y-2">
                    {items.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                            {(provided, snapshot) => (
                                <li
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`p-3 rounded-lg flex justify-between items-center transition-shadow ${snapshot.isDragging ? 'shadow-lg bg-blue-100' : 'bg-gray-100'}`}
                                >
                                    <span>{item.content}</span>
                                    <button onClick={() => type === 'CRITERIA' ? removeCriterion(index) : removeOption(index)} className="text-gray-400 hover:text-red-600 transition-colors">
                                        {garbageCanIcon}
                                    </button>
                                </li>
                            )}
                        </Draggable>
                    ))}
                    {provided.placeholder}
                </ul>
            )}
        </Droppable>
    </DragDropContext>
  );

  return (
    <Card title="Step 1: Define Goal, Criteria & Options">
        <div className="mb-6">
            <label htmlFor="objective" className="block text-xl font-semibold text-gray-700 mb-2">Decision Objective</label>
            <textarea
                id="objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g., Select the best car for a family"
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                rows="2"
            />
        </div>
        <div className="grid md:grid-cols-2 gap-8">
            <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Criteria</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newCriterion}
                        onChange={(e) => setNewCriterion(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addCriterion()}
                        placeholder="New criterion name"
                        className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button onClick={addCriterion} className="text-green-500 hover:text-green-600 transition-colors transform hover:scale-125">
                        {plusIcon}
                    </button>
                </div>
                {renderList(criteria, 'CRITERIA')}
            </div>
            <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Options (Alternatives)</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addOption()}
                        placeholder="New option name"
                        className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button onClick={addOption} className="text-green-500 hover:text-green-600 transition-colors transform hover:scale-125">
                        {plusIcon}
                    </button>
                </div>
                {renderList(options, 'OPTIONS')}
            </div>
        </div>
    </Card>
  );
};

const getIntensityDescription = (value) => {
    const intValue = Math.round(value);
    switch (intValue) {
        case 1: return "Equal Importance: Two factors contribute equally to the objective.";
        case 2: return "Intermediate Importance between 1 and 3.";
        case 3: return "Somewhat More Important: Experience and judgment slightly favor one over the other.";
        case 4: return "Intermediate Importance between 3 and 5.";
        case 5: return "Much More Important: Experience and judgment strongly favor one over the other.";
        case 6: return "Intermediate Importance between 5 and 7.";
        case 7: return "Very Much More Important: A factor is favored very strongly over the other.";
        case 8: return "Intermediate Importance between 7 and 9.";
        case 9: return "Extremely More Important: The evidence favoring one factor over another is of the highest possible validity.";
        default: return "";
    }
};

const ComparisonSlider = ({ crit1, crit2, value, onChange }) => {
    // Convert matrix value to slider position (-8 to 8)
    // Negative slider value means crit1 is more important
    // Positive slider value means crit2 is more important
    const sliderValue = value >= 1 ? -(value - 1) : (1 / value - 1);

    const handleSliderChange = (e) => {
        const newSliderValue = parseFloat(e.target.value);
        let newMatrixValue;
        if (newSliderValue <= 0) { // Left side -> crit1 is more important
            newMatrixValue = -newSliderValue + 1;
        } else { // Right side -> crit2 is more important
            newMatrixValue = 1 / (newSliderValue + 1);
        }
        onChange(newMatrixValue);
    };

    let preferenceText;
    let intensityValue;

    if (value > 1) {
        preferenceText = `${crit1} is ${Math.round(value)}x more important than ${crit2}`;
        intensityValue = value;
    } else if (value < 1) {
        const inverseValue = 1 / value;
        preferenceText = `${crit2} is ${Math.round(inverseValue)}x more important than ${crit1}`;
        intensityValue = inverseValue;
    } else {
        preferenceText = "Both criteria are equally important";
        intensityValue = 1;
    }

    return (
        <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-2 font-semibold text-gray-700">
                <span>{crit1}</span>
                <span>{crit2}</span>
            </div>
            <input
                type="range"
                min="-8"
                max="8"
                step="1"
                value={sliderValue}
                onChange={handleSliderChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>More important</span>
                <span>More important</span>
            </div>
            <div className="text-center mt-3 p-2 bg-white rounded-md shadow-inner">
                <p className="font-semibold text-blue-700">{preferenceText}</p>
                <p className="text-sm text-gray-600">{getIntensityDescription(intensityValue)}</p>
            </div>
        </div>
    );
};


const Step2 = ({ criteria, pairwiseMatrix, onMatrixChange, weights, consistency }) => {
    const handleComparisonChange = (i, j, newValue) => {
        const newMatrix = pairwiseMatrix.map(r => r.slice());
        newMatrix[i][j] = newValue;
        newMatrix[j][i] = 1 / newValue;
        onMatrixChange(newMatrix);
    };

    return (
        <Card title="Step 2: Pairwise Comparison of Criteria">
            <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6" role="alert">
              <p className="font-bold">How this works:</p>
              <p>For each pair of criteria, move the slider to indicate which is more important and by how much. The scale ranges from 1 (equally important) to 9 (extremely more important). Your judgments will be used to calculate the weight, or overall importance, of each criterion.</p>
            </div>
            <div className="space-y-4">
                {criteria.map((crit1, i) =>
                    criteria.map((crit2, j) => {
                        if (i < j) {
                            return (
                                <ComparisonSlider
                                    key={`${i}-${j}`}
                                    crit1={crit1.content}
                                    crit2={crit2.content}
                                    value={pairwiseMatrix[i]?.[j] || 1}
                                    onChange={(newValue) => handleComparisonChange(i, j, newValue)}
                                />
                            );
                        }
                        return null;
                    })
                )}
            </div>
             {weights.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Results</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-bold">Relative Importance (Weights)</h4>
                            <ul className="list-disc list-inside">
                                {criteria.map((criterion, index) => (
                                    <li key={criterion.id}>{criterion.content}: <span className="font-mono">{(weights[index] * 100).toFixed(2)}%</span></li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold">Consistency Check</h4>
                            <p>Consistency Ratio (CR): <span className={`font-mono font-bold ${consistency.isConsistent ? 'text-green-600' : 'text-red-600'}`}>{consistency.cr.toFixed(4)}</span></p>
                            <p className={`text-sm ${consistency.isConsistent ? 'text-green-700' : 'text-red-700'}`}>
                                {consistency.isConsistent ? 'Judgments are consistent (CR < 0.1)' : 'Inconsistent judgments (CR >= 0.1). Please review your comparisons.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};

const UtilityChart = ({ utilityFunction }) => {
    const chartData = useMemo(() => {
        const points = utilityFunction.points?.slice().sort((a, b) => a.x - b.x) || [];
        
        let labels, data;

        if (utilityFunction.criterionType === 'quantitative' && utilityFunction.mode === 'formula' && utilityFunction.formulaString) {
            const minX = points.length > 0 ? points[0].x : 0;
            const maxX = points.length > 0 ? points[points.length - 1].x : 100;
            const range = maxX - minX;
            
            labels = Array.from({length: 11}, (_, i) => minX + i * (range / 10));
            data = labels.map(x => safeEval(utilityFunction.formulaString, x));
        } else if (utilityFunction.criterionType === 'quantitative') {
            labels = points.map(p => p.x);
            data = points.map(p => p.y);
        } else { // Qualitative
            labels = utilityFunction.qualitativeLevels.map(l => l.label);
            data = utilityFunction.qualitativeLevels.map(l => l.utility);
        }

        return {
            labels,
            datasets: [{
                label: 'Utility',
                data,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                tension: 0.1,
            }]
        };
    }, [utilityFunction]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { type: utilityFunction.criterionType === 'quantitative' ? 'linear' : 'category', title: { display: true, text: 'Criterion Value / Label' } },
            y: { title: { display: true, text: 'Utility' }, min: 0, max: 100 }
        }
    };

    return (
        <div className="relative h-64 mt-4">
            {utilityFunction.criterionType === 'quantitative' ? (
                <Line data={chartData} options={chartOptions} />
            ) : (
                <Bar data={chartData} options={chartOptions} />
            )}
        </div>
    );
};

const Step3 = ({ criteria, utilityFunctions, setUtilityFunctions }) => {
    
    const setFunctionData = (criterionId, data) => {
        setUtilityFunctions(prev => ({
            ...prev,
            [criterionId]: { ...prev[criterionId], ...data }
        }));
    };

    const addPoint = (criterionId) => {
        const newPoints = [...utilityFunctions[criterionId].points, { x: 0, y: 0 }];
        setFunctionData(criterionId, { points: newPoints });
    };
    
    const addQualitativeLevel = (criterionId) => {
        const newLevels = [...utilityFunctions[criterionId].qualitativeLevels, { label: 'New Level', utility: 50 }];
        setFunctionData(criterionId, { qualitativeLevels: newLevels });
    };

    const updatePoint = (criterionId, index, field, value) => {
        const newPoints = [...utilityFunctions[criterionId].points];
        newPoints[index][field] = parseFloat(value) || 0;
        setFunctionData(criterionId, { points: newPoints });
    };
    
    const updateQualitativeLevel = (criterionId, index, field, value) => {
        const newLevels = [...utilityFunctions[criterionId].qualitativeLevels];
        newLevels[index][field] = field === 'utility' ? (parseFloat(value) || 0) : value;
        setFunctionData(criterionId, { qualitativeLevels: newLevels });
    };
    
    const removePoint = (criterionId, index) => {
        const newPoints = [...utilityFunctions[criterionId].points];
        newPoints.splice(index, 1);
        setFunctionData(criterionId, { points: newPoints });
    }
    
    const removeQualitativeLevel = (criterionId, index) => {
        const newLevels = [...utilityFunctions[criterionId].qualitativeLevels];
        newLevels.splice(index, 1);
        setFunctionData(criterionId, { qualitativeLevels: newLevels });
    }

    const TabButton = ({ text, active, onClick }) => (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
        >
            {text}
        </button>
    );

    return (
        <Card title="Step 3: Define Utility Functions">
            <div className="space-y-8">
                {criteria.map(criterion => {
                    const funcData = utilityFunctions[criterion.id];
                    if (!funcData) return null; // FIX: Prevent crash on new criterion
                    
                    return (
                        <div key={criterion.id} className="p-4 bg-gray-50 rounded-lg">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xl font-semibold text-gray-800">{criterion.content}</h3>
                                <select
                                    value={funcData.criterionType}
                                    onChange={(e) => setFunctionData(criterion.id, { criterionType: e.target.value })}
                                    className="p-2 border rounded-lg"
                                >
                                    <option value="quantitative">Quantitative</option>
                                    <option value="qualitative">Qualitative</option>
                                </select>
                            </div>
                            
                            {funcData.criterionType === 'quantitative' ? (
                            <>
                                <div className="border-b border-gray-300">
                                    <TabButton text="Formula" active={funcData.mode === 'formula'} onClick={() => setFunctionData(criterion.id, { mode: 'formula' })} />
                                    <TabButton text="Table" active={funcData.mode === 'table'} onClick={() => setFunctionData(criterion.id, { mode: 'table' })} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                                    <div>
                                        {funcData.mode === 'formula' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Formula (e.g., 100 - x/1000)</label>
                                                <input type="text" placeholder="Enter formula with 'x'" value={funcData.formulaString} onChange={(e) => setFunctionData(criterion.id, { formulaString: e.target.value })} className="w-full p-2 border rounded-lg mt-1"/>
                                            </div>
                                        )}
                                        {funcData.mode === 'table' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Define with Points</label>
                                                <div className="space-y-2 mt-1 max-h-48 overflow-y-auto pr-2">
                                                    {funcData.points.map((point, index) => (
                                                        <div key={index} className="flex items-center gap-2">
                                                            <input type="number" value={point.x} onChange={(e) => updatePoint(criterion.id, index, 'x', e.target.value)} className="w-full p-1 border rounded-md" placeholder="Value"/>
                                                            <span>→</span>
                                                            <input type="number" value={point.y} onChange={(e) => updatePoint(criterion.id, index, 'y', e.target.value)} className="w-full p-1 border rounded-md" placeholder="Utility"/>
                                                            <button onClick={() => removePoint(criterion.id, index)} className="text-red-500 hover:text-red-700">X</button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button onClick={() => addPoint(criterion.id)} className="mt-2 text-sm bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600">Add Point</button>
                                            </div>
                                        )}
                                    </div>
                                    <div><UtilityChart utilityFunction={funcData} /></div>
                                </div>
                            </>
                            ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Define Qualitative Levels</label>
                                    <div className="space-y-2 mt-1 max-h-48 overflow-y-auto pr-2">
                                        {funcData.qualitativeLevels.map((level, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <input type="text" value={level.label} onChange={(e) => updateQualitativeLevel(criterion.id, index, 'label', e.target.value)} className="w-full p-1 border rounded-md" placeholder="Label (e.g., High)"/>
                                                <span>→</span>
                                                <input type="number" value={level.utility} onChange={(e) => updateQualitativeLevel(criterion.id, index, 'utility', e.target.value)} className="w-full p-1 border rounded-md" placeholder="Utility"/>
                                                <button onClick={() => removeQualitativeLevel(criterion.id, index)} className="text-red-500 hover:text-red-700">X</button>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => addQualitativeLevel(criterion.id)} className="mt-2 text-sm bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600">Add Level</button>
                                </div>
                                <div><UtilityChart utilityFunction={funcData} /></div>
                            </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};


const Step4 = ({ options, criteria, optionValues, setOptionValues, utilityFunctions, utilityScores, setUtilityScores }) => {
    const handleValueChange = (optionId, criterionId, value) => {
        setOptionValues(prev => ({
            ...prev,
            [optionId]: { ...prev[optionId], [criterionId]: value }
        }));
    };

    const calculateScores = useCallback(() => {
        const newUtilityScores = {};
        options.forEach(option => {
            newUtilityScores[option.id] = {};
            criteria.forEach(criterion => {
                const func = utilityFunctions[criterion.id];
                let utility = 0;

                if (func) {
                    if (func.criterionType === 'qualitative') {
                        const selectedLabel = optionValues[option.id]?.[criterion.id];
                        const level = func.qualitativeLevels.find(l => l.label === selectedLabel);
                        if (level) {
                            utility = level.utility;
                        }
                    } else {
                        const value = parseFloat(optionValues[option.id]?.[criterion.id]);
                        if (!isNaN(value)) {
                            if (func.mode === 'formula' && func.formulaString) {
                                const result = safeEval(func.formulaString, value);
                                if (result !== null) utility = result;
                            } else if (func.mode === 'table' && func.points && func.points.length > 0) {
                                utility = interpolate(value, func.points);
                            }
                        }
                    }
                }
                newUtilityScores[option.id][criterion.id] = Math.max(0, Math.min(100, utility));
            });
        });
        setUtilityScores(newUtilityScores);
    }, [options, criteria, optionValues, utilityFunctions, setUtilityScores]);


    useEffect(() => {
        calculateScores();
    }, [calculateScores]);

    return (
        <Card title="Step 4: Evaluate Alternatives & Calculate Utility">
            <p className="text-sm text-gray-600 mb-4">Enter the value for each option against each criterion. For qualitative criteria, select the appropriate level from the dropdown.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr>
                            <th className="p-3 bg-gray-100 font-semibold text-gray-700 border-b-2 border-gray-200">Option</th>
                            {criteria.map(c => <th key={c.id} className="p-3 bg-gray-100 font-semibold text-gray-700 border-b-2 border-gray-200">{c.content}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {options.map(option => (
                            <tr key={option.id} className="hover:bg-gray-50">
                                <td className="p-3 border-b border-gray-200 font-semibold">{option.content}</td>
                                {criteria.map(criterion => (
                                    <td key={criterion.id} className="p-2 border-b border-gray-200">
                                        {utilityFunctions[criterion.id]?.criterionType === 'qualitative' ? (
                                            <select
                                                value={optionValues[option.id]?.[criterion.id] || ''}
                                                onChange={(e) => handleValueChange(option.id, criterion.id, e.target.value)}
                                                className="w-full p-1 border rounded-md mb-1"
                                            >
                                                <option value="">Select Level</option>
                                                {utilityFunctions[criterion.id].qualitativeLevels.map(level => (
                                                    <option key={level.label} value={level.label}>{level.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="number"
                                                value={optionValues[option.id]?.[criterion.id] || ''}
                                                onChange={(e) => handleValueChange(option.id, criterion.id, e.target.value)}
                                                className="w-full p-1 border rounded-md mb-1"
                                            />
                                        )}
                                        <div className="text-right text-xs text-gray-400">
                                            Utility: {(utilityScores[option.id]?.[criterion.id] || 0).toFixed(0)}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

const Step5 = ({ onGenerateReport, ...props }) => {
    const { objective, options, criteria, weights, utilityScores } = props;

    const finalScores = useMemo(() => {
        const scores = {};
        options.forEach(option => {
            let totalScore = 0;
            criteria.forEach((criterion, index) => {
                const utility = utilityScores[option.id]?.[criterion.id] || 0;
                const weight = weights[index] || 0;
                totalScore += utility * weight;
            });
            scores[option.id] = totalScore;
        });
        return scores;
    }, [options, criteria, weights, utilityScores]);

    const sortedOptions = useMemo(() => 
        options.map(o => ({...o, score: finalScores[o.id] || 0})).sort((a, b) => b.score - a.score),
        [options, finalScores]
    );
    
    const chartData = {
        labels: sortedOptions.map(o => o.content),
        datasets: [
            {
                label: 'Final Scores',
                data: sortedOptions.map(o => o.score),
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
            },
        ],
    };
    
    const chartOptions = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: true,
                text: 'Final Decision Ranking',
                font: { size: 18 }
            },
        },
        scales: {
            x: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Total Weighted Score'
                }
            }
        }
    };

    return (
        <Card title="Step 5: View Results & Export Report">
            <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-700">Decision Objective</h3>
                <p className="text-gray-600 mt-1">{objective}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Final Ranking</h3>
                    <ol className="list-decimal list-inside space-y-2">
                        {sortedOptions.map((option, index) => (
                            <li key={option.id} className={`p-3 rounded-lg ${index === 0 ? 'bg-green-100 text-green-800 font-bold' : 'bg-gray-100'}`}>
                                <span className="mr-2">{option.content}:</span>
                                <span className="font-mono">{option.score.toFixed(2)}</span>
                            </li>
                        ))}
                    </ol>
                    <button onClick={onGenerateReport} className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors w-full flex items-center justify-center gap-2 text-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Generate Report
                    </button>
                </div>
                <div className="relative h-96">
                    <Bar data={chartData} options={chartOptions} />
                </div>
            </div>
        </Card>
    );
};

const ReportPage = ({ data, onBack }) => {
    useEffect(() => {
        if (!data) {
            onBack();
            return;
        }
        const { objective, sortedOptions, criteria, weights, consistency, pairwiseMatrix, utilityFunctions, optionValues } = data;
        const reportWindow = window.open('', '_blank');
        if (reportWindow) {
            const resultsTable = sortedOptions.map((opt, index) => `
                <tr class="hover:bg-gray-50">
                    <td class="p-3 border">${index + 1}</td>
                    <td class="p-3 border font-semibold">${opt.content}</td>
                    <td class="p-3 border font-mono">${opt.score.toFixed(2)}</td>
                </tr>
            `).join('');

            const weightsTable = criteria.map((crit, index) => `
                <tr class="hover:bg-gray-50">
                    <td class="p-3 border">${crit.content}</td>
                    <td class="p-3 border font-mono">${(weights[index] * 100).toFixed(2)}%</td>
                </tr>
            `).join('');
            
            const simplifiedPairwise = criteria.map((crit1, i) => {
                return criteria.map((crit2, j) => {
                    if (i >= j) return null;
                    const value = pairwiseMatrix[i][j];
                    let intensity;
                    if (value >= 1) {
                        intensity = ((value - 1) / 8) * 50;
                        return `<div class="flex items-center justify-between p-2"><span class="w-1/3 text-right">${crit1.content}</span><div class="w-1/3 mx-2 h-2 bg-gray-200 rounded-full"><div class="h-2 bg-blue-500 rounded-l-full" style="width:${intensity}%; margin-left:${50-intensity}%"></div></div><span class="w-1/3 text-left">${crit2.content}</span></div>`;
                    } else {
                        const inv = 1 / value;
                        intensity = ((inv - 1) / 8) * 50;
                        return `<div class="flex items-center justify-between p-2"><span class="w-1/3 text-right">${crit1.content}</span><div class="w-1/3 mx-2 h-2 bg-gray-200 rounded-full"><div class="h-2 bg-blue-500 rounded-r-full" style="width:${intensity}%; margin-left:50%"></div></div><span class="w-1/3 text-left">${crit2.content}</span></div>`;
                    }
                }).filter(Boolean).join('');
            }).join('');

            const utilityAppendix = criteria.map(crit => {
                const func = utilityFunctions[crit.id];
                let content;
                if (func.criterionType === 'qualitative') {
                    const levels = func.qualitativeLevels.map(l => `<li>${l.label}: ${l.utility}</li>`).join('');
                    content = `<ul>${levels}</ul>`;
                } else if (func.mode === 'formula') {
                    content = `<p class="font-mono bg-gray-100 p-2 rounded">f(x) = ${func.formulaString}</p>`;
                } else {
                    const points = func.points.map(p => `<li>Value ${p.x} → Utility ${p.y}</li>`).join('');
                    content = `<ul>${points}</ul>`;
                }
                return `<div class="mb-4"><h4 class="font-semibold">${crit.content} (${func.criterionType})</h4>${content}</div>`;
            }).join('');

            const evaluationsHeader = criteria.map(c => `<th class="p-2 border">${c.content}</th>`).join('');
            const evaluationsBody = data.options.map(option => `
                <tr>
                    <th class="p-2 border bg-gray-100">${option.content}</th>
                    ${criteria.map(criterion => `<td class="p-2 border text-center font-mono">${optionValues[option.id]?.[criterion.id] || 'N/A'}</td>`).join('')}
                </tr>
            `).join('');

            reportWindow.document.write(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>AHP Analysis Report</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; } }
                        section { page-break-inside: avoid; }
                    </style>
                </head>
                <body class="bg-white p-8 md:p-12 font-sans">
                    <div class="no-print mb-8 text-center flex justify-center gap-4">
                        <button onclick="window.close()" class="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors">
                            ← Close Report
                        </button>
                        <button onclick="window.print()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                            Print or Save as PDF
                        </button>
                    </div>
                    <div class="max-w-4xl mx-auto">
                        <header class="text-center border-b-2 pb-4 mb-8">
                            <h1 class="text-4xl font-bold text-gray-800">Decision Analysis Report</h1>
                            <p class="text-lg text-gray-600 mt-2">Analytic Hierarchy Process (AHP)</p>
                        </header>
                        <section class="mb-10">
                            <h2 class="text-2xl font-semibold text-gray-700 border-b pb-2 mb-4">1. About This Report</h2>
                            <p class="text-gray-700 mb-2">This report uses the Analytic Hierarchy Process (AHP) to break down a complex decision into a structured system of goals, criteria, and alternatives. This allows for a systematic and rational evaluation. For more details on the methodology, see the <a href="https://www.burgehugheswalsh.co.uk/Uploaded/1/Documents/Analytic-Hierarchy-Process-Tool-v2.pdf" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">AHP explanation document</a>.</p>
                        </section>
                        <section class="mb-10">
                            <h2 class="text-2xl font-semibold text-gray-700 border-b pb-2 mb-4">2. Executive Summary</h2>
                            <p class="text-lg text-gray-700 mb-2"><strong>Decision Goal:</strong> ${objective}</p>
                            <div class="bg-green-100 border-l-4 border-green-500 text-green-800 p-4 rounded-r-lg">
                                <p class="font-bold text-xl">Recommendation: ${sortedOptions[0]?.content || 'N/A'}</p>
                                <p>Based on the criteria and weightings provided, the recommended option is <strong>${sortedOptions[0]?.content || 'N/A'}</strong> with a final score of <strong>${sortedOptions[0]?.score.toFixed(2) || '0.00'}</strong>.</p>
                            </div>
                        </section>
                        <section class="mb-10">
                            <h2 class="text-2xl font-semibold text-gray-700 border-b pb-2 mb-4">3. Final Results</h2>
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-100"><tr><th class="p-3 border">Rank</th><th class="p-3 border">Option</th><th class="p-3 border">Final Score</th></tr></thead>
                                <tbody>${resultsTable}</tbody>
                            </table>
                        </section>
                        <section class="mb-10">
                            <h2 class="text-2xl font-semibold text-gray-700 border-b pb-2 mb-4">4. Criteria Weights & Consistency</h2>
                            <p class="text-gray-600 mb-4">The following weights were determined by comparing the relative importance of each criterion. The Consistency Ratio (CR) checks for contradictions in the judgments; a value below 0.10 is considered acceptable.</p>
                            <div class="grid md:grid-cols-2 gap-8">
                                <table class="w-full text-left border-collapse">
                                    <thead class="bg-gray-100"><tr><th class="p-3 border">Criterion</th><th class="p-3 border">Weight</th></tr></thead>
                                    <tbody>${weightsTable}</tbody>
                                </table>
                                <div class="p-4 bg-gray-100 rounded-lg">
                                    <h4 class="font-bold text-lg">Consistency Check</h4>
                                    <p class="text-2xl font-mono ${consistency.isConsistent ? 'text-green-600' : 'text-red-600'}">${consistency.cr.toFixed(4)}</p>
                                    <p>${consistency.isConsistent ? 'Judgments are consistent.' : 'Judgments are inconsistent.'}</p>
                                </div>
                            </div>
                        </section>
                        <section class="mb-10" style="page-break-before: always;">
                            <h2 class="text-2xl font-semibold text-gray-700 border-b pb-2 mb-4">5. Appendix</h2>
                            <h3 class="text-xl font-semibold text-gray-700 mt-6 mb-2">A. Simplified Pairwise Comparisons</h3>
                            <div class="space-y-2">${simplifiedPairwise}</div>
                            <h3 class="text-xl font-semibold text-gray-700 mt-8 mb-2">B. Utility Functions</h3>
                            <div class="p-4 border rounded-lg">${utilityAppendix}</div>
                            <h3 class="text-xl font-semibold text-gray-700 mt-8 mb-2">C. Option Evaluations</h3>
                            <table class="w-full text-left border-collapse text-sm">
                                <thead class="bg-gray-100"><tr><th class="p-2 border">Option</th>${evaluationsHeader}</tr></thead>
                                <tbody>${evaluationsBody}</tbody>
                            </table>
                        </section>
                    </div>
                </body>
                </html>
            `);
            reportWindow.document.close();
        }
    }, [data, onBack]);

    if (!data) {
        return <div className="p-8">Loading report data...</div>;
    }

    return null; // This component now only handles opening the report
};

function App() {
    const [objective, setObjective] = useState("<DESCRIPTION> Decision making to select the best option");
  
    const [criteria, setCriteria] = useState([
        { id: 'Risk', content: 'Risk' },
        { id: 'SW Effort/Schedule', content: 'SW Effort/Schedule' },
        { id: 'HW Costs', content: 'HW Costs' },
        { id: 'Future Adaptability', content: 'Future Adaptability' }
    ]);
    
    const [options, setOptions] = useState([
        { id: 'Dual Primary', content: 'Dual Primary' },
        { id: 'Compressed Dual Primary', content: 'Compressed Dual Primary' },
        { id: 'Compressed Asymmetric Primary', content: 'Compressed Asymmetric Primary' },
        { id: 'Tele-assisted Secondary', content: 'Tele-assisted Secondary' }
    ]);
    
    const [pairwiseMatrix, setPairwiseMatrix] = useState([
      [1, 9, 7, 7],
      [1/9, 1, 3, 1/3],
      [1/7, 1/3, 1, 5],
      [1/7, 3, 1/5, 1]
    ]);
    
    const [weights, setWeights] = useState([]);
    const [consistency, setConsistency] = useState({ cr: 0, isConsistent: true });
    
    const [utilityFunctions, setUtilityFunctions] = useState({
        'Risk': { criterionType: 'qualitative', mode: 'table', formulaString: '', points: [], qualitativeLevels: [{label: 'Low', utility: 100}, {label: 'Medium', utility: 50}, {label: 'High', utility: 0}] },
        'SW Effort/Schedule': { criterionType: 'quantitative', mode: 'table', formulaString: '', points: [{x: 0, y: 0}, {x: 100, y: 100}], qualitativeLevels: [] },
        'HW Costs': { criterionType: 'quantitative', mode: 'formula', formulaString: '100 * (400000 - x) / (400000 - 300000)', points: [{x: 300000, y: 100}, {x: 400000, y: 0}], qualitativeLevels: [] },
        'Future Adaptability': { criterionType: 'quantitative', mode: 'table', formulaString: '', points: [{x: 0, y: 0}, {x: 100, y: 100}], qualitativeLevels: [] }
    });
    const [utilityScores, setUtilityScores] = useState({});
    
    const [optionValues, setOptionValues] = useState({});
    const [view, setView] = useState('main'); // 'main' or 'report'

    useEffect(() => {
        if (criteria.length > 0 && pairwiseMatrix.length === criteria.length) {
            const newWeights = calculateWeights(normalizeMatrix(pairwiseMatrix));
            setWeights(newWeights);
            const newConsistency = checkConsistency(pairwiseMatrix);
            setConsistency(newConsistency);
        }
    }, [pairwiseMatrix, criteria]);

    const finalScores = useMemo(() => {
        if (criteria.length === 0 || options.length === 0) return [];
        try {
            const normalizedMatrix = normalizeMatrix(pairwiseMatrix);
            const weights = calculateWeights(normalizedMatrix);
            const calculatedOptionValues = calculateOptionValues(options, criteria, utilityFunctions);
            const scores = calculateFinalScores(options, criteria, weights, calculatedOptionValues);
            return scores;
        } catch (error) {
            console.error("Error calculating final scores:", error);
            return [];
        }
    }, [criteria, options, pairwiseMatrix, utilityFunctions]);

    const sortedOptions = useMemo(() => {
        if (finalScores.length === 0) return [];
        const enrichedOptions = options.map(opt => ({
            ...opt,
            score: finalScores.find(s => s.optionId === opt.id)?.score || 0
        }));
        return enrichedOptions.sort((a, b) => b.score - a.score);
    }, [options, finalScores]);

    const handleSave = () => {
        const dataStr = JSON.stringify({ objective, criteria, options, pairwiseMatrix, utilityFunctions, optionValues });
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ahp_data.json";
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleLoad = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                setObjective(data.objective);
                setCriteria(data.criteria);
                setOptions(data.options);
                setPairwiseMatrix(data.pairwiseMatrix);
                setUtilityFunctions(data.utilityFunctions);
                setOptionValues(data.optionValues);
            } catch (error) {
                console.error("Error loading file:", error);
            }
        };
        reader.readAsText(file);
    };

    const handleMatrixChange = (newMatrix) => {
        setPairwiseMatrix(newMatrix);
    };

    const handleGenerateReport = () => {
        setView('report');
    };

    if (view === 'report') {
        const reportData = {
            objective,
            sortedOptions,
            criteria,
            weights: calculateWeights(normalizeMatrix(pairwiseMatrix)),
            consistency: checkConsistency(pairwiseMatrix),
            pairwiseMatrix,
            utilityFunctions,
            optionValues: calculateOptionValues(options, criteria, utilityFunctions),
            options,
        };
        return <ReportPage data={reportData} onBack={() => setView('main')} />;
    }

    return (
        <DndProvider backend={HTML5Backend}>
        <div className="bg-gray-50 min-h-screen font-sans">
            <div className="bg-green-50 border-b-2 border-green-200 p-4">
                <header className="text-center">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-green-800">AHP Decision-Making Tool</h1>
                    <p className="text-lg text-green-700 mt-2">A structured approach to complex decision-making.</p>
                </header>
            </div>
            <div className="container mx-auto p-4 md:p-8">
                <main>
                    <Step1 objective={objective} setObjective={setObjective} criteria={criteria} setCriteria={setCriteria} options={options} setOptions={setOptions} />
                    <Step2 criteria={criteria} pairwiseMatrix={pairwiseMatrix} onMatrixChange={handleMatrixChange} weights={weights} consistency={consistency} />
                    <Step3 criteria={criteria} utilityFunctions={utilityFunctions} setUtilityFunctions={setUtilityFunctions} />
                    <Step4 options={options} criteria={criteria} optionValues={optionValues} setOptionValues={setOptionValues} utilityFunctions={utilityFunctions} utilityScores={utilityScores} setUtilityScores={setUtilityScores} />
                    
                    {weights.length > 0 && Object.keys(utilityScores).length > 0 && (
                      <Step5 
                        objective={objective} 
                        options={options} 
                        criteria={criteria} 
                        weights={weights} 
                        consistency={consistency}
                        utilityScores={utilityScores}
                        pairwiseMatrix={pairwiseMatrix}
                        utilityFunctions={utilityFunctions}
                        optionValues={optionValues}
                        onGenerateReport={handleGenerateReport}
                      />
                    )}
                </main>
            </div>
        </div>
        </DndProvider>
    );
}

export default App;

