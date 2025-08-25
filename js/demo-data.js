// js/demo-data.js

// This file contains rich demo data to make the marketplace feel populated.
export const demoProfiles = [
    {
        uid: 'demo-forester-1',
        username: 'John "Smokey" Miller',
        role: 'forester',
        email: 'smokey@demo.com',
        bio: 'SAF Certified Forester with 25 years of experience in the Ouachita Mountains. Specializing in sustainable pine management and wildlife habitat improvement.',
        serviceArea: 'Western Arkansas, Eastern Oklahoma',
        certifications: 'SAF Certified, AR Registered Forester #101',
        services: ['valuation', 'management', 'sale-admin', 'burning'],
        location: { lat: 34.58, lng: -93.05 }, // Hot Springs, AR
        serviceRadius: 120
    },
    {
        uid: 'demo-forester-2',
        username: 'Green Timber Consulting',
        role: 'forester',
        email: 'gtc@demo.com',
        bio: 'We provide comprehensive forest management services for private landowners throughout the Mississippi Delta region.',
        serviceArea: 'Eastern Arkansas, Western Mississippi',
        certifications: 'MS Registered Forester #205',
        services: ['valuation', 'management', 'reforestation'],
        location: { lat: 34.91, lng: -90.35 }, // Helena, AR
        serviceRadius: 90
    },
    {
        uid: 'demo-buyer-1',
        username: 'Delta Pine Products',
        role: 'buyer',
        email: 'dpp@demo.com',
        bio: 'Large-scale pine sawtimber and pulpwood buyer for mills across the Southeast. We offer competitive pricing and fast payment.',
        serviceArea: 'AR, LA, MS, TX',
        products: ['pine-sawtimber', 'pine-pulpwood'],
        location: { lat: 33.22, lng: -92.66 }, // El Dorado, AR
        serviceRadius: 200
    },
    {
        uid: 'demo-buyer-2',
        username: 'Ozark Hardwood Inc.',
        role: 'buyer',
        email: 'ohi@demo.com',
        bio: 'Specialty buyer of high-quality white oak, red oak, and walnut sawlogs. We purchase standing timber and logs delivered to our mill.',
        serviceArea: 'Northern Arkansas, Southern Missouri',
        products: ['hw-sawlogs'],
        location: { lat: 36.37, lng: -92.38 }, // Mountain Home, AR
        serviceRadius: 150
    },
    {
        uid: 'demo-contractor-1',
        username: 'Ridge Runner Logging',
        role: 'contractor',
        email: 'rrl@demo.com',
        bio: 'Professional and efficient logging services. We are fully insured and use modern, low-impact equipment.',
        serviceArea: 'Central Arkansas',
        services: ['logging'],
        location: { lat: 34.72, lng: -92.60 }, // Benton, AR
        serviceRadius: 80
    },
    {
        uid: 'demo-contractor-2',
        username: 'Southern Reforestation',
        role: 'contractor',
        email: 'sr@demo.com',
        bio: 'Complete reforestation services, including site prep, herbicide application, and machine planting. We guarantee high survival rates.',
        serviceArea: 'Statewide',
        services: ['mulching', 'herbicide', 'planting'],
        location: { lat: 34.23, lng: -92.01 }, // Pine Bluff, AR
        serviceRadius: 180
    }
];