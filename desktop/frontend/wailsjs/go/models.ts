export namespace models {
	
	export class GeoJSONPolygon {
	    type: string;
	    coordinates: number[][][];
	
	    static createFrom(source: any = {}) {
	        return new GeoJSONPolygon(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.coordinates = source["coordinates"];
	    }
	}
	export class Area {
	    id: string;
	    parentAreaId: string;
	    number: string;
	    polygonId?: string;
	    geometry?: GeoJSONPolygon;
	    deletedAt?: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new Area(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.parentAreaId = source["parentAreaId"];
	        this.number = source["number"];
	        this.polygonId = source["polygonId"];
	        this.geometry = this.convertValues(source["geometry"], GeoJSONPolygon);
	        this.deletedAt = this.convertValues(source["deletedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AreaAvailability {
	    id: string;
	    scopeId: string;
	    areaId: string;
	    type: string;
	    scopeGroupId: string;
	    setById: string;
	    createdAt: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new AreaAvailability(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.scopeId = source["scopeId"];
	        this.areaId = source["areaId"];
	        this.type = source["type"];
	        this.scopeGroupId = source["scopeGroupId"];
	        this.setById = source["setById"];
	        this.createdAt = this.convertValues(source["createdAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Coordinate {
	    lat: number;
	    lng: number;
	
	    static createFrom(source: any = {}) {
	        return new Coordinate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lat = source["lat"];
	        this.lng = source["lng"];
	    }
	}
	
	export class Group {
	    id: string;
	    name: string;
	    sortOrder: number;
	
	    static createFrom(source: any = {}) {
	        return new Group(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.sortOrder = source["sortOrder"];
	    }
	}
	export class Invitation {
	    id: string;
	    type: string;
	    status: string;
	    inviterId: string;
	    inviteeId: string;
	    targetRole: string;
	    description: string;
	    createdAt: time.Time;
	    resolvedAt?: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new Invitation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.status = source["status"];
	        this.inviterId = source["inviterId"];
	        this.inviteeId = source["inviteeId"];
	        this.targetRole = source["targetRole"];
	        this.description = source["description"];
	        this.createdAt = this.convertValues(source["createdAt"], time.Time);
	        this.resolvedAt = this.convertValues(source["resolvedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ParentArea {
	    id: string;
	    regionId: string;
	    number: string;
	    name: string;
	    geometry?: GeoJSONPolygon;
	    deletedAt?: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new ParentArea(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.regionId = source["regionId"];
	        this.number = source["number"];
	        this.name = source["name"];
	        this.geometry = this.convertValues(source["geometry"], GeoJSONPolygon);
	        this.deletedAt = this.convertValues(source["deletedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Place {
	    id: string;
	    areaId: string;
	    coord: Coordinate;
	    type: string;
	    label: string;
	    displayName: string;
	    address: string;
	    description: string;
	    parentId: string;
	    sortOrder: number;
	    languages: string[];
	    doNotVisit: boolean;
	    doNotVisitNote: string;
	    createdAt: time.Time;
	    updatedAt: time.Time;
	    deletedAt?: time.Time;
	    restoredFromId?: string;
	
	    static createFrom(source: any = {}) {
	        return new Place(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.areaId = source["areaId"];
	        this.coord = this.convertValues(source["coord"], Coordinate);
	        this.type = source["type"];
	        this.label = source["label"];
	        this.displayName = source["displayName"];
	        this.address = source["address"];
	        this.description = source["description"];
	        this.parentId = source["parentId"];
	        this.sortOrder = source["sortOrder"];
	        this.languages = source["languages"];
	        this.doNotVisit = source["doNotVisit"];
	        this.doNotVisitNote = source["doNotVisitNote"];
	        this.createdAt = this.convertValues(source["createdAt"], time.Time);
	        this.updatedAt = this.convertValues(source["updatedAt"], time.Time);
	        this.deletedAt = this.convertValues(source["deletedAt"], time.Time);
	        this.restoredFromId = source["restoredFromId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Region {
	    id: string;
	    name: string;
	    symbol: string;
	    approved: boolean;
	    geometry?: GeoJSONPolygon;
	    order: number;
	    deletedAt?: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new Region(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.symbol = source["symbol"];
	        this.approved = source["approved"];
	        this.geometry = this.convertValues(source["geometry"], GeoJSONPolygon);
	        this.order = source["order"];
	        this.deletedAt = this.convertValues(source["deletedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SchedulePeriod {
	    id: string;
	    name: string;
	    startDate: time.Time;
	    endDate: time.Time;
	    approved: boolean;
	    createdAt: time.Time;
	    updatedAt: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new SchedulePeriod(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.startDate = this.convertValues(source["startDate"], time.Time);
	        this.endDate = this.convertValues(source["endDate"], time.Time);
	        this.approved = source["approved"];
	        this.createdAt = this.convertValues(source["createdAt"], time.Time);
	        this.updatedAt = this.convertValues(source["updatedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Scope {
	    id: string;
	    schedulePeriodId: string;
	    name: string;
	    groupId: string;
	    parentAreaIds: string[];
	    createdAt: time.Time;
	    updatedAt: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new Scope(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.schedulePeriodId = source["schedulePeriodId"];
	        this.name = source["name"];
	        this.groupId = source["groupId"];
	        this.parentAreaIds = source["parentAreaIds"];
	        this.createdAt = this.convertValues(source["createdAt"], time.Time);
	        this.updatedAt = this.convertValues(source["updatedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Tag {
	    id: string;
	    name: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new Tag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	    }
	}
	export class User {
	    id: string;
	    name: string;
	    role: string;
	    orgGroupId: string;
	    tagIds: string[];
	    joinedAt: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.role = source["role"];
	        this.orgGroupId = source["orgGroupId"];
	        this.tagIds = source["tagIds"];
	        this.joinedAt = this.convertValues(source["joinedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class VisitRecord {
	    id: string;
	    userId: string;
	    placeId: string;
	    coord?: Coordinate;
	    areaId: string;
	    activityId: string;
	    result: string;
	    appliedRequestId?: string;
	    visitedAt: time.Time;
	    createdAt: time.Time;
	    updatedAt: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new VisitRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.placeId = source["placeId"];
	        this.coord = this.convertValues(source["coord"], Coordinate);
	        this.areaId = source["areaId"];
	        this.activityId = source["activityId"];
	        this.result = source["result"];
	        this.appliedRequestId = source["appliedRequestId"];
	        this.visitedAt = this.convertValues(source["visitedAt"], time.Time);
	        this.createdAt = this.convertValues(source["createdAt"], time.Time);
	        this.updatedAt = this.convertValues(source["updatedAt"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace time {
	
	export class Time {
	
	
	    static createFrom(source: any = {}) {
	        return new Time(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}

}

