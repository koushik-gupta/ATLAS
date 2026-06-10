export const MOCK_TRIP_OPTION = {
  option_label: "The Grand Himalayan Expedition",
  summary: "A multi-modal journey spanning flights, trains, and mountain drives from the plains of Bengal to the high Himalayas.",
  total_cost_inr: 125400,
  total_travel_hours: 24.5,
  constraints_applied: [
    "Multi-modal transit synchronization",
    "Strict acclimatization pacing enforced",
    "Scenic route optimization"
  ],
  route: [
    {
      city: "Kolkata",
      type: "urban",
      coordinates: [88.3639, 22.5726],
      nights: 0,
      image: "https://images.unsplash.com/photo-1558431382-27e303142255?q=80&w=1280&auto=format&fit=crop",
      planner_scratchpad: "Journey origin. Fast transit out to Delhi.",
      hotel: null,
      transport_to_city: null, // First node has no incoming transport
      day_plans: []
    },
    {
      city: "Delhi",
      type: "urban",
      coordinates: [77.2090, 28.6139],
      nights: 1,
      image: "https://images.unsplash.com/photo-1587474260584-136574528ed5?q=80&w=1280&auto=format&fit=crop",
      planner_scratchpad: "Transit hub. Short overnight layover before the mountain railway.",
      hotel: {
        name: "The Imperial, New Delhi",
        address: "Janpath, New Delhi",
        price_per_night: "₹15,000",
        rating: 9.4,
        stars: 5
      },
      transport_to_city: {
        provider: "IndiGo 6E-2021",
        type: "flight",
        travel_class: "Economy",
        price: "₹6,500",
        departure_time: "10:00",
        arrival_time: "12:15",
        duration: "2h 15m",
        origin: "CCU",
        destination: "DEL"
      },
      day_plans: [
        {
          day_number: 1,
          date: "Oct 10, 2026",
          weather_forecast: "Warm, 28°C",
          rest_hours_allocated: 4.0,
          activities: [
            {
              start_time: "12:15",
              end_time: "13:30",
              activity_type: "Transit",
              description: "Flight arrival and transfer to hotel."
            }
          ]
        }
      ]
    },
    {
      city: "Kalka",
      type: "transit",
      coordinates: [76.9388, 30.8354],
      nights: 0,
      image: "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?q=80&w=1280&auto=format&fit=crop",
      planner_scratchpad: "Boarding point for the UNESCO Heritage Toy Train.",
      hotel: null,
      transport_to_city: {
        provider: "Kalka Shatabdi Express",
        type: "train",
        travel_class: "Executive Chair Car",
        price: "₹1,200",
        departure_time: "07:40",
        arrival_time: "11:45",
        duration: "4h 05m",
        origin: "NDLS",
        destination: "KLK"
      },
      day_plans: []
    },
    {
      city: "Shimla",
      type: "mountain",
      coordinates: [77.1734, 31.1048],
      nights: 3,
      image: "https://images.unsplash.com/photo-1595815771614-ade9d652a65d?q=80&w=1280&auto=format&fit=crop",
      planner_scratchpad: "Essential first stop for acclimatization at 2,276m.",
      hotel: {
        name: "Wildflower Hall, An Oberoi Resort",
        address: "Charabra, Shimla",
        price_per_night: "₹18,000",
        rating: 9.6,
        stars: 5
      },
      transport_to_city: {
        provider: "Kalka-Shimla Toy Train",
        type: "train", // We can use train here to show two trains in a row, or car. We'll use train as requested.
        travel_class: "First Class CC",
        price: "₹800",
        departure_time: "12:10",
        arrival_time: "17:30",
        duration: "5h 20m",
        origin: "Kalka",
        destination: "Shimla"
      },
      day_plans: [
        {
          day_number: 2,
          date: "Oct 11, 2026",
          weather_forecast: "Crisp and clear, 14°C",
          rest_hours_allocated: 4.5,
          activities: [
            {
              start_time: "12:10",
              end_time: "17:30",
              activity_type: "Transit",
              description: "Board the UNESCO heritage toy train."
            }
          ]
        }
      ]
    },
    {
      city: "Manali",
      type: "mountain",
      coordinates: [77.1887, 32.2396],
      nights: 4,
      image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1280&auto=format&fit=crop",
      planner_scratchpad: "Now fully acclimatized, ready for the 2,050m base of Manali.",
      hotel: {
        name: "The Himalayan",
        address: "Hadimba Road, Manali",
        price_per_night: "₹12,500",
        rating: 9.2,
        stars: 4
      },
      transport_to_city: {
        provider: "Private Innova SUV",
        type: "car",
        travel_class: "Premium SUV",
        price: "₹6,000",
        departure_time: "08:00",
        arrival_time: "15:30",
        duration: "7h 30m",
        origin: "Shimla",
        destination: "Manali"
      },
      day_plans: [
        {
          day_number: 5,
          date: "Oct 14, 2026",
          weather_forecast: "Cool winds, 10°C",
          rest_hours_allocated: 3.0,
          activities: [
            {
              start_time: "08:00",
              end_time: "15:30",
              activity_type: "Transit",
              description: "Scenic drive alongside the Beas river."
            }
          ]
        }
      ]
    }
  ]
};
